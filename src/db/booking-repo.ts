import { and, asc, count, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import { bookingEvents, bookings, eventTypes, teamMembers, users } from "./schema";
import * as schema from "./schema";
import { ok, type Result } from "../lib/result";
import {
  applyEvent,
  projectState,
  type BookingEvent,
  type BookingEventKind,
  type BookingEventPayload,
  type BookingState,
  type BookingStateError,
} from "../core/booking/state";
import type { BookingRecord } from "../core/assignment/round-robin";
import type { AssignmentExplanation } from "../core/assignment/round-robin";
import type { BookingAnswers } from "../core/booking/questions";
import type { BookingLocation } from "../core/booking/locations";

type Db = NodePgDatabase<typeof schema>;

type StoredPayload = Record<string, unknown>;

function toInstant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

function serializePayload(event: BookingEvent): StoredPayload {
  switch (event.kind) {
    case "created":
      return {
        startsAt: event.payload.startsAt.toString(),
        endsAt: event.payload.endsAt.toString(),
        hostUserIds: event.payload.hostUserIds,
        ...(event.payload.routingAnswers ? { routingAnswers: event.payload.routingAnswers } : {}),
        ...(event.payload.bookingAnswers ? { bookingAnswers: event.payload.bookingAnswers } : {}),
        ...(event.payload.bookingLocation ? { bookingLocation: event.payload.bookingLocation } : {}),
        ...(event.payload.assignment ? { assignment: event.payload.assignment } : {}),
      };
    case "rescheduled":
      return {
        startsAt: event.payload.startsAt.toString(),
        endsAt: event.payload.endsAt.toString(),
      };
    case "cancelled":
      return { reason: event.payload.reason };
    case "reassigned":
      return {
        hostUserIds: event.payload.hostUserIds,
        ...(event.payload.assignment ? { assignment: event.payload.assignment } : {}),
      };
    case "no_show":
    case "invite_sent":
    case "invite_delivered":
    case "reminder_sent":
      return {};
    case "invite_failed":
      return { reason: event.payload.reason };
  }
}

function deserializeEvent(row: { kind: BookingEventKind; payload: unknown }): BookingEvent {
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  switch (row.kind) {
    case "created": {
      const routingAnswers = payload["routingAnswers"] as
        | Record<string, string | string[]>
        | undefined;
      const assignment = payload["assignment"] as AssignmentExplanation | undefined;
      const bookingAnswers = payload["bookingAnswers"] as BookingAnswers | undefined;
      const bookingLocation = payload["bookingLocation"] as BookingLocation | undefined;
      return {
        kind: "created",
        payload: {
          startsAt: Temporal.Instant.from(payload["startsAt"] as string),
          endsAt: Temporal.Instant.from(payload["endsAt"] as string),
          hostUserIds: payload["hostUserIds"] as string[],
          ...(routingAnswers ? { routingAnswers } : {}),
          ...(bookingAnswers ? { bookingAnswers } : {}),
          ...(bookingLocation ? { bookingLocation } : {}),
          ...(assignment ? { assignment } : {}),
        },
      };
    }
    case "rescheduled":
      return {
        kind: "rescheduled",
        payload: {
          startsAt: Temporal.Instant.from(payload["startsAt"] as string),
          endsAt: Temporal.Instant.from(payload["endsAt"] as string),
        },
      };
    case "cancelled":
      return { kind: "cancelled", payload: { reason: payload["reason"] as string | undefined } };
    case "reassigned": {
      const assignment = payload["assignment"] as AssignmentExplanation | undefined;
      return {
        kind: "reassigned",
        payload: {
          hostUserIds: payload["hostUserIds"] as string[],
          ...(assignment ? { assignment } : {}),
        },
      };
    }
    case "no_show":
      return { kind: "no_show", payload: {} };
    case "invite_sent":
      return { kind: "invite_sent", payload: {} };
    case "invite_delivered":
      return { kind: "invite_delivered", payload: {} };
    case "invite_failed":
      return { kind: "invite_failed", payload: { reason: payload["reason"] as string | undefined } };
    case "reminder_sent":
      return { kind: "reminder_sent", payload: {} };
  }
}

function currentStateResult(events: readonly BookingEvent[]): Result<BookingState | null, BookingStateError> {
  return events.length === 0 ? ok(null) : projectState(events);
}

async function loadEvents(tx: Db, bookingId: string): Promise<BookingEvent[]> {
  const rows = await tx
    .select({ kind: bookingEvents.kind, payload: bookingEvents.payload })
    .from(bookingEvents)
    .where(eq(bookingEvents.bookingId, bookingId))
    .orderBy(asc(bookingEvents.createdAt));

  return rows.map(deserializeEvent);
}

async function writeProjection(tx: Db, bookingId: string, state: BookingState): Promise<void> {
  await tx
    .update(bookings)
    .set({
      status: state.status,
      inviteStatus: state.inviteStatus,
      startsAt: new Date(state.startsAt.epochMilliseconds),
      endsAt: new Date(state.endsAt.epochMilliseconds),
      hostUserIds: [...state.hostUserIds],
    })
    .where(eq(bookings.id, bookingId));
}

/**
 * Appends one event to a booking's log and folds the new state into the
 * `bookings` projection row, all inside one transaction. The current state
 * is re-derived from the event log (not read off the projection) so a
 * drifted projection can never validate a transition it shouldn't allow;
 * `rebuildProjection` is the repair path for drift itself.
 *
 * The `bookings` row must already exist before the "created" event is
 * appended (booking_events.booking_id is a not-null FK) — callers create it
 * in the same outer transaction, e.g. holds-repo's confirmHold (task 12).
 */
export async function appendEvent<K extends BookingEventKind>(
  bookingId: string,
  kind: K,
  payload: BookingEventPayload<K>,
  executor: Db = getDb(),
): Promise<Result<BookingState, BookingStateError>> {
  const event = { kind, payload } as BookingEvent;

  return executor.transaction(async (tx) => {
    const events = await loadEvents(tx, bookingId);
    const stateResult = currentStateResult(events);
    if (!stateResult.ok) return stateResult;

    const result = applyEvent(stateResult.value, event);
    if (!result.ok) return result;

    await tx.insert(bookingEvents).values({
      bookingId,
      kind,
      payload: serializePayload(event),
    });
    await writeProjection(tx, bookingId, result.value);

    return ok(result.value);
  });
}

/** Repairs a drifted projection by refolding the full event history. */
export async function rebuildProjection(
  bookingId: string,
  executor: Db = getDb(),
): Promise<Result<BookingState, BookingStateError>> {
  return executor.transaction(async (tx) => {
    const events = await loadEvents(tx, bookingId);
    const result = projectState(events);
    if (!result.ok) return result;

    await writeProjection(tx, bookingId, result.value);
    return result;
  });
}

export interface BookingRow {
  readonly id: string;
  readonly workspaceId?: string;
  readonly eventTypeId: string;
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly inviteeEmail: string;
  readonly inviteeName: string;
  readonly inviteeTimezone: string;
  /** booking-form notes; optional for the same fixture-compatibility reason
   * as inviteStatus below */
  readonly inviteeNotes?: string | null;
  readonly meetingFormat?: string | null;
  readonly inviteePhone?: string | null;
  readonly hostUserIds: readonly string[];
  readonly status: string;
  /** invite lifecycle projection: none | sent | delivered | failed.
   * Optional so BookingRow fixtures that predate the column stay valid;
   * rows loaded from the database always carry it. */
  readonly inviteStatus?: string;
  readonly rescheduleToken: string;
  readonly cancelToken: string;
  readonly routingAnswers?: Record<string, string | string[]> | null;
  readonly bookingAnswers?: BookingAnswers;
  readonly bookingLocation?: BookingLocation | null;
  /** Google Calendar event id once written through to the organizer host's
   * calendar; null/absent means the ICS email is the calendar artifact.
   * Optional for the same fixture-compatibility reason as inviteStatus. */
  readonly googleEventId?: string | null;
}

/** Loads a booking row for the booking endpoints (task 14): reschedule/cancel
 * authenticate against rescheduleToken/cancelToken here, and /bookings uses it
 * to render the confirmation response after confirmHold. */
export async function getBookingById(id: string, executor: Db = getDb()): Promise<BookingRow | null> {
  const [row] = await executor.select().from(bookings).where(eq(bookings.id, id));
  if (!row) return null;

  return {
    id: row.id,
    eventTypeId: row.eventTypeId,
    startsAt: Temporal.Instant.fromEpochMilliseconds(row.startsAt.getTime()),
    endsAt: Temporal.Instant.fromEpochMilliseconds(row.endsAt.getTime()),
    inviteeEmail: row.inviteeEmail,
    inviteeName: row.inviteeName,
    inviteeTimezone: row.inviteeTimezone,
    inviteeNotes: row.inviteeNotes,
    meetingFormat: row.meetingFormat,
    inviteePhone: row.inviteePhone,
    hostUserIds: row.hostUserIds,
    status: row.status,
    inviteStatus: row.inviteStatus,
    rescheduleToken: row.rescheduleToken,
    cancelToken: row.cancelToken,
    routingAnswers: row.routingAnswers as Record<string, string | string[]> | null,
    bookingAnswers: row.bookingAnswers,
    bookingLocation: row.bookingLocation,
    googleEventId: row.googleEventId,
  };
}

/** Records the write-through: set after events.insert succeeds so retries of
 * the invite job see the event already exists. */
export async function setGoogleEventId(
  bookingId: string,
  eventId: string,
  executor: Db = getDb(),
): Promise<void> {
  await executor.update(bookings).set({ googleEventId: eventId }).where(eq(bookings.id, bookingId));
}

export interface InviteHost {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly timezone: string;
}

export interface InviteContext {
  readonly workspaceId?: string;
  readonly booking: BookingRow;
  readonly eventTypeTitle: string;
  readonly eventTypeSlug: string;
  readonly eventTypeTheme?: string;
  readonly eventTypeLogoUrl?: string | null;
  readonly bookingQuestions?: readonly import("../core/booking/questions").BookingQuestion[];
  readonly hosts: readonly InviteHost[];
  /** Number of reschedules so far — the ICS SEQUENCE for iTIP updates. */
  readonly rescheduleCount: number;
}

/** Everything the invite-email job needs in one load: the booking, the event
 * type's public identity, the hosts' contact details, and the reschedule
 * count that drives the ICS SEQUENCE. */
export async function getInviteContext(
  bookingId: string,
  executor: Db = getDb(),
): Promise<InviteContext | null> {
  const booking = await getBookingById(bookingId, executor);
  if (!booking) return null;

  const [eventType] = await executor
    .select({
      title: eventTypes.title,
      slug: eventTypes.slug,
      theme: eventTypes.theme,
      logoUrl: eventTypes.logoUrl,
      bookingQuestions: eventTypes.bookingQuestions,
    })
    .from(eventTypes)
    .where(eq(eventTypes.id, booking.eventTypeId));
  if (!eventType) return null;

  const hostRows = booking.hostUserIds.length
    ? await executor
        .select({ id: users.id, name: users.name, email: users.email, timezone: users.timezone })
        .from(users)
        .where(inArray(users.id, [...booking.hostUserIds]))
    : [];
  // preserve hostUserIds order: the first host is the ICS organizer
  const byId = new Map(hostRows.map((h) => [h.id, h]));
  const hosts = booking.hostUserIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id: row.id, name: row.name, email: row.email, timezone: row.timezone }] : [];
  });

  const rescheduled = await executor
    .select({ id: bookingEvents.id })
    .from(bookingEvents)
    .where(and(eq(bookingEvents.bookingId, bookingId), eq(bookingEvents.kind, "rescheduled")));

  return {
    ...(booking.workspaceId ? { workspaceId: booking.workspaceId } : {}),
    booking,
    eventTypeTitle: eventType.title,
    eventTypeSlug: eventType.slug,
    eventTypeTheme: eventType.theme,
    eventTypeLogoUrl: eventType.logoUrl,
    bookingQuestions: eventType.bookingQuestions,
    hosts,
    rescheduleCount: rescheduled.length,
  };
}

/**
 * Confirmed bookings due a reminder: starting within `lead` of `now`, where
 * the current time slot was set (created or last rescheduled) before the
 * reminder point — a booking made or moved inside the window just received a
 * confirmation email and gets no extra nudge — and where no reminder has been
 * sent since the last reschedule, so moving a meeting re-arms its reminder.
 * Dedup lives here, in the log, not in a projection flag (see the
 * reminder_sent case in src/core/booking/state.ts).
 */
export async function listBookingsNeedingReminder(
  now: Temporal.Instant,
  lead: Temporal.Duration,
  executor: Db = getDb(),
): Promise<string[]> {
  const nowDate = new Date(now.epochMilliseconds);
  const windowEnd = new Date(now.add(lead).epochMilliseconds);
  const leadMs = lead.total({ unit: "milliseconds" });

  const result = await executor.execute<{ id: string }>(sql`
    select b.id
    from ${bookings} b
    where b.status = 'confirmed'
      and b.starts_at > ${nowDate}
      and b.starts_at <= ${windowEnd}
      and (
        select max(e.created_at) from ${bookingEvents} e
        where e.booking_id = b.id and e.kind in ('created', 'rescheduled')
      ) <= b.starts_at - make_interval(secs => ${leadMs / 1000})
      and not exists (
        select 1 from ${bookingEvents} r
        where r.booking_id = b.id
          and r.kind = 'reminder_sent'
          and r.created_at > coalesce(
            (select max(e2.created_at) from ${bookingEvents} e2
             where e2.booking_id = b.id and e2.kind = 'rescheduled'),
            'epoch'::timestamptz
          )
      )
  `);

  return result.rows.map((row) => row.id);
}

/**
 * Past "created" events for the given hosts, as round-robin's BookingRecord
 * (task 10 input) - `bookedAt` is when the host's turn was used (the booking
 * was created), not the meeting time, since that's what weighted
 * least-recently-booked ranks on. The kind filter narrows the join at the
 * database; the per-host membership test happens in JS because hostUserIds is
 * a jsonb array and this project favors the simple approach over a jsonb
 * containment operator for what is, at this project's scale, a small table.
 */
export async function getBookingHistoryForHosts(
  hostUserIds: readonly string[],
  executor: Db = getDb(),
): Promise<BookingRecord[]> {
  if (hostUserIds.length === 0) return [];
  const wanted = new Set(hostUserIds);

  const rows = await executor
    .select({ hostUserIds: bookings.hostUserIds, createdAt: bookingEvents.createdAt })
    .from(bookingEvents)
    .innerJoin(bookings, eq(bookingEvents.bookingId, bookings.id))
    .where(eq(bookingEvents.kind, "created"));

  const records: BookingRecord[] = [];
  for (const row of rows) {
    for (const hostUserId of row.hostUserIds) {
      if (wanted.has(hostUserId)) {
        records.push({ userId: hostUserId, bookedAt: Temporal.Instant.fromEpochMilliseconds(row.createdAt.getTime()) });
      }
    }
  }
  return records;
}

/**
 * Returns the most recent stored assignment decision visible to an admin.
 * Ownership follows the same owner-or-team-member rule as event-type admin
 * routes. Missing, inaccessible, solo, and group bookings intentionally
 * collapse to null so booking UUIDs cannot be probed across accounts.
 */
export async function getAssignmentExplanationForUser(
  bookingId: string,
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<AssignmentExplanation | null> {
  const [row] = await executor
    .select({ payload: bookingEvents.payload })
    .from(bookingEvents)
    .innerJoin(bookings, eq(bookings.id, bookingEvents.bookingId))
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.teamId, eventTypes.teamId), eq(teamMembers.userId, userId)),
    )
    .where(
      and(
        eq(bookings.id, bookingId),
        ...(workspaceId ? [eq(bookings.workspaceId, workspaceId)] : []),
        inArray(bookingEvents.kind, ["created", "reassigned"]),
        or(eq(eventTypes.ownerUserId, userId), eq(teamMembers.userId, userId)),
      ),
    )
    .orderBy(desc(bookingEvents.createdAt), desc(bookingEvents.id))
    .limit(1);

  const payload = (row?.payload ?? {}) as Record<string, unknown>;
  return (payload["assignment"] as AssignmentExplanation | undefined) ?? null;
}

export interface AdminBookingRow {
  readonly id: string;
  readonly eventType: { readonly slug: string; readonly title: string };
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly inviteeName: string;
  readonly inviteeEmail: string;
  readonly hostUserIds: readonly string[];
  readonly status: string;
  readonly inviteStatus: string;
}

export interface AdminBookingDetail extends AdminBookingRow {
  readonly inviteeTimezone: string;
  readonly inviteeNotes: string | null;
  readonly meetingFormat?: string | null;
  readonly inviteePhone?: string | null;
  readonly routingAnswers: Record<string, string | string[]> | null;
  readonly bookingAnswers?: BookingAnswers;
  readonly bookingQuestions?: readonly import("../core/booking/questions").BookingQuestion[];
  readonly bookingLocation?: BookingLocation | null;
  readonly hasGoogleEvent: boolean;
  readonly events: readonly {
    readonly kind: BookingEventKind;
    readonly payload: unknown;
    readonly createdAt: Temporal.Instant;
  }[];
}

export interface AdminBookingPage {
  readonly bookings: readonly AdminBookingRow[];
  readonly total: number;
}

function adminBookingRow(row: {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  inviteeName: string;
  inviteeEmail: string;
  hostUserIds: string[];
  status: string;
  inviteStatus: string;
}): AdminBookingRow {
  return {
    id: row.id,
    eventType: { slug: row.slug, title: row.title },
    startsAt: toInstant(row.startsAt),
    endsAt: toInstant(row.endsAt),
    inviteeName: row.inviteeName,
    inviteeEmail: row.inviteeEmail,
    hostUserIds: row.hostUserIds,
    status: row.status,
    inviteStatus: row.inviteStatus,
  };
}

function adminScope(userId: string) {
  return or(
    eq(eventTypes.ownerUserId, userId),
    eq(teamMembers.userId, userId),
    sql`${bookings.hostUserIds} @> ${JSON.stringify([userId])}::jsonb`,
  );
}

export async function listBookingsForUser(
  input: {
    userId: string;
    filter: "upcoming" | "past";
    status?: string;
    page: number;
    pageSize: number;
    now: Temporal.Instant;
    workspaceId?: string;
  },
  executor: Db = getDb(),
): Promise<AdminBookingPage> {
  const timeCondition =
    input.filter === "upcoming"
      ? gte(bookings.startsAt, new Date(input.now.epochMilliseconds))
      : lt(bookings.startsAt, new Date(input.now.epochMilliseconds));
  const where = and(
    adminScope(input.userId),
    ...(input.workspaceId ? [eq(bookings.workspaceId, input.workspaceId)] : []),
    timeCondition,
    ...(input.status ? [eq(bookings.status, input.status)] : []),
  );
  const baseSelection = {
    id: bookings.id,
    slug: eventTypes.slug,
    title: eventTypes.title,
    startsAt: bookings.startsAt,
    endsAt: bookings.endsAt,
    inviteeName: bookings.inviteeName,
    inviteeEmail: bookings.inviteeEmail,
    hostUserIds: bookings.hostUserIds,
    status: bookings.status,
    inviteStatus: bookings.inviteStatus,
  };
  const rows = await executor
    .select(baseSelection)
    .from(bookings)
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.teamId, eventTypes.teamId), eq(teamMembers.userId, input.userId)),
    )
    .where(where)
    .orderBy(input.filter === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const [totalRow] = await executor
    .select({ total: count() })
    .from(bookings)
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.teamId, eventTypes.teamId), eq(teamMembers.userId, input.userId)),
    )
    .where(where);

  return { bookings: rows.map(adminBookingRow), total: totalRow?.total ?? 0 };
}

export async function getBookingDetailForUser(
  bookingId: string,
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<AdminBookingDetail | null> {
  const [row] = await executor
    .select({
      id: bookings.id,
      slug: eventTypes.slug,
      title: eventTypes.title,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      inviteeName: bookings.inviteeName,
      inviteeEmail: bookings.inviteeEmail,
      inviteeTimezone: bookings.inviteeTimezone,
      inviteeNotes: bookings.inviteeNotes,
      meetingFormat: bookings.meetingFormat,
      inviteePhone: bookings.inviteePhone,
      hostUserIds: bookings.hostUserIds,
      status: bookings.status,
      inviteStatus: bookings.inviteStatus,
      routingAnswers: bookings.routingAnswers,
      bookingAnswers: bookings.bookingAnswers,
      bookingQuestions: eventTypes.bookingQuestions,
      bookingLocation: bookings.bookingLocation,
      googleEventId: bookings.googleEventId,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.teamId, eventTypes.teamId), eq(teamMembers.userId, userId)),
    )
    .where(and(
      eq(bookings.id, bookingId),
      ...(workspaceId ? [eq(bookings.workspaceId, workspaceId)] : []),
      adminScope(userId),
    ));
  if (!row) return null;

  const events = await executor
    .select({
      kind: bookingEvents.kind,
      payload: bookingEvents.payload,
      createdAt: bookingEvents.createdAt,
    })
    .from(bookingEvents)
    .where(eq(bookingEvents.bookingId, bookingId))
    .orderBy(asc(bookingEvents.createdAt), asc(bookingEvents.id));

  return {
    ...adminBookingRow(row),
    inviteeTimezone: row.inviteeTimezone,
    inviteeNotes: row.inviteeNotes,
    meetingFormat: row.meetingFormat,
    inviteePhone: row.inviteePhone,
    routingAnswers: row.routingAnswers as Record<string, string | string[]> | null,
    bookingAnswers: row.bookingAnswers,
    bookingQuestions: row.bookingQuestions,
    bookingLocation: row.bookingLocation,
    hasGoogleEvent: row.googleEventId !== null,
    events: events.map((event) => ({
      kind: event.kind,
      payload: event.payload,
      createdAt: toInstant(event.createdAt),
    })),
  };
}

export async function markBookingNoShowForUser(
  bookingId: string,
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<Result<BookingState, BookingStateError> | null> {
  return executor.transaction(async (tx) => {
    const [visible] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
      .leftJoin(
        teamMembers,
        and(eq(teamMembers.teamId, eventTypes.teamId), eq(teamMembers.userId, userId)),
      )
      .where(and(
        eq(bookings.id, bookingId),
        ...(workspaceId ? [eq(bookings.workspaceId, workspaceId)] : []),
        adminScope(userId),
      ));
    if (!visible) return null;
    return appendEvent(bookingId, "no_show", {}, tx);
  });
}

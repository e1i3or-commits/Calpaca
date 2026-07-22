import { and, asc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import { bookingEvents, bookings, eventTypes, users } from "./schema";
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

type Db = NodePgDatabase<typeof schema>;

type StoredPayload = Record<string, unknown>;

function serializePayload(event: BookingEvent): StoredPayload {
  switch (event.kind) {
    case "created":
      return {
        startsAt: event.payload.startsAt.toString(),
        endsAt: event.payload.endsAt.toString(),
        hostUserIds: event.payload.hostUserIds,
        ...(event.payload.routingAnswers ? { routingAnswers: event.payload.routingAnswers } : {}),
      };
    case "rescheduled":
      return {
        startsAt: event.payload.startsAt.toString(),
        endsAt: event.payload.endsAt.toString(),
      };
    case "cancelled":
      return { reason: event.payload.reason };
    case "reassigned":
      return { hostUserIds: event.payload.hostUserIds };
    case "no_show":
    case "invite_sent":
    case "invite_delivered":
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
      return {
        kind: "created",
        payload: {
          startsAt: Temporal.Instant.from(payload["startsAt"] as string),
          endsAt: Temporal.Instant.from(payload["endsAt"] as string),
          hostUserIds: payload["hostUserIds"] as string[],
          ...(routingAnswers ? { routingAnswers } : {}),
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
    case "reassigned":
      return { kind: "reassigned", payload: { hostUserIds: payload["hostUserIds"] as string[] } };
    case "no_show":
      return { kind: "no_show", payload: {} };
    case "invite_sent":
      return { kind: "invite_sent", payload: {} };
    case "invite_delivered":
      return { kind: "invite_delivered", payload: {} };
    case "invite_failed":
      return { kind: "invite_failed", payload: { reason: payload["reason"] as string | undefined } };
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
  readonly eventTypeId: string;
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly inviteeEmail: string;
  readonly inviteeName: string;
  readonly inviteeTimezone: string;
  readonly hostUserIds: readonly string[];
  readonly status: string;
  readonly rescheduleToken: string;
  readonly cancelToken: string;
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
    hostUserIds: row.hostUserIds,
    status: row.status,
    rescheduleToken: row.rescheduleToken,
    cancelToken: row.cancelToken,
  };
}

export interface InviteHost {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly timezone: string;
}

export interface InviteContext {
  readonly booking: BookingRow;
  readonly eventTypeTitle: string;
  readonly eventTypeSlug: string;
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
    .select({ title: eventTypes.title, slug: eventTypes.slug })
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
    booking,
    eventTypeTitle: eventType.title,
    eventTypeSlug: eventType.slug,
    hosts,
    rescheduleCount: rescheduled.length,
  };
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

import { and, count, eq, gt, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import { bookings, eventTypes, holds, oneOffOffers, proposals } from "./schema";
import * as schema from "./schema";
import { ok, err, type Result } from "../lib/result";
import { generateToken } from "../lib/id";
import { appendEvent } from "./booking-repo";
import {
  buildAssignmentExplanation,
  type AssignmentCandidate,
  type AssignmentExplanation,
  type BookingRecord,
} from "../core/assignment/round-robin";
import type { BookingState, BookingStateError } from "../core/booking/state";
import type { RoutingAnswers } from "../core/routing/condition";
import type { BookingAnswers } from "../core/booking/questions";
import {
  resolveBookingLocation,
  type EventLocation,
  type LocationType,
} from "../core/booking/locations";

type Db = NodePgDatabase<typeof schema>;

export interface Slot {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

export interface HoldRecord {
  readonly id: string;
  readonly hostUserId: string;
}

export type CreateHoldError = { readonly kind: "slot_taken" };

export interface Invitee {
  readonly email: string;
  readonly name: string;
  readonly timezone: string;
  /** optional booking-form notes ("anything that will help prepare") */
  readonly notes?: string;
}

export interface MeetingDetails {
  readonly format: LocationType;
  readonly phone?: string;
  readonly location?: EventLocation;
}

export type ConfirmHoldError =
  | { readonly kind: "not_found" }
  | { readonly kind: "expired" }
  | { readonly kind: "not_active" }
  | { readonly kind: "offer_unavailable" }
  | { readonly kind: "proposal_unavailable" };

export interface ConfirmedBooking {
  readonly bookingId: string;
  readonly hostUserIds: readonly string[];
}

export interface ConfirmHoldExpectation {
  readonly eventTypeId: string;
}

function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function toInstant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

/**
 * Inserts one active hold per host inside a single transaction. Locking the
 * event type serializes capacity checks, so concurrent requests cannot both
 * claim the final seat. Capacity greater than one is restricted to solo event
 * types; group and round-robin links retain their single-booking behavior.
 */
export async function createHold(
  eventTypeId: string,
  hostUserIds: readonly string[],
  slot: Slot,
  ttl: Temporal.Duration,
  executor: Db = getDb(),
): Promise<Result<readonly HoldRecord[], CreateHoldError>> {
  const expiresAt = toDate(Temporal.Now.instant().add(ttl));
  const slotStart = toDate(slot.start);
  const slotEnd = toDate(slot.end);

  const inserted = await executor.transaction(async (tx) => {
      // Event-type locking protects capacity, while stable per-host advisory
      // locks serialize claims across every event type without a lock table.
      for (const hostUserId of [...new Set(hostUserIds)].sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${hostUserId}, 0))`);
      }
      const [eventType] = await tx.select({
        capacity: eventTypes.capacity,
      }).from(eventTypes)
        .where(eq(eventTypes.id, eventTypeId))
        .for("update");
      if (!eventType) return null;
      for (const hostUserId of hostUserIds) {
        const [conflictingHold] = await tx.select({ id: holds.id }).from(holds).where(and(
          eq(holds.hostUserId, hostUserId),
          eq(holds.status, "active"),
          gt(holds.expiresAt, new Date()),
          sql`${holds.slotStart} < ${slotEnd}`,
          sql`${holds.slotEnd} > ${slotStart}`,
          or(
            ne(holds.eventTypeId, eventTypeId),
            ne(holds.slotStart, slotStart),
            ne(holds.slotEnd, slotEnd),
          ),
        )).limit(1);
        const [conflictingBooking] = await tx.select({ id: bookings.id }).from(bookings).where(and(
          sql`${bookings.hostUserIds} ? ${hostUserId}`,
          eq(bookings.status, "confirmed"),
          sql`${bookings.startsAt} < ${slotEnd}`,
          sql`${bookings.endsAt} > ${slotStart}`,
          or(
            ne(bookings.eventTypeId, eventTypeId),
            ne(bookings.startsAt, slotStart),
            ne(bookings.endsAt, slotEnd),
          ),
        )).limit(1);
        if (conflictingHold || conflictingBooking) return null;
      }
      const [activeHolds, confirmedBookings] = await Promise.all([
        tx.select({ count: count() }).from(holds).where(and(
          eq(holds.eventTypeId, eventTypeId),
          eq(holds.slotStart, slotStart),
          eq(holds.status, "active"),
          gt(holds.expiresAt, new Date()),
        )),
        tx.select({ count: count() }).from(bookings).where(and(
          eq(bookings.eventTypeId, eventTypeId),
          eq(bookings.startsAt, slotStart),
          eq(bookings.status, "confirmed"),
        )),
      ]);
      if (
        (activeHolds[0]?.count ?? 0) + (confirmedBookings[0]?.count ?? 0)
        >= eventType.capacity
      ) return null;
      const records: HoldRecord[] = [];
      for (const hostUserId of hostUserIds) {
        const [row] = await tx
          .insert(holds)
          .values({ eventTypeId, hostUserId, slotStart, slotEnd, expiresAt })
          .returning({ id: holds.id, hostUserId: holds.hostUserId });
        if (!row) throw new Error("hold insert returned no row");
        records.push(row);
      }
      return records;
    });
  return inserted ? ok(inserted) : err({ kind: "slot_taken" });
}

/** Live active rows only: expired-but-unreaped holds never consume capacity. */
export async function countActiveHoldsForEventType(
  eventTypeId: string,
  now: Temporal.Instant,
  executor: Db = getDb(),
): Promise<number> {
  const [row] = await executor
    .select({ count: count() })
    .from(holds)
    .where(
      and(
        eq(holds.eventTypeId, eventTypeId),
        eq(holds.status, "active"),
        gt(holds.expiresAt, toDate(now)),
      ),
    );
  return row?.count ?? 0;
}

export async function releaseHolds(
  holdIds: readonly string[],
  executor: Db = getDb(),
): Promise<void> {
  if (holdIds.length === 0) return;
  await executor.update(holds)
    .set({ status: "released" })
    .where(and(inArray(holds.id, [...holdIds]), eq(holds.status, "active")));
}

/**
 * Round-robin assignment input for confirmHold (task 14): `candidates` is the
 * pool's weights (event_type_hosts), `history` is past bookings for load
 * ranking. Winner selection happens inside confirmHold's own FOR-UPDATE
 * transaction so the hold row a concurrent racer sees is already resolved.
 */
export interface RoundRobinAssignment {
  readonly candidates: readonly AssignmentCandidate[];
  readonly history: readonly BookingRecord[];
}

/**
 * Locks the given hold rows FOR UPDATE, re-verifies each is still active and
 * unexpired, then creates the booking + "created" event (booking-repo,
 * task 11) and marks the holds confirmed — all in one transaction. The
 * bookings row is inserted here, inside the same transaction that appends
 * the "created" event, satisfying booking-repo's ordering requirement.
 *
 * `assignment` is round robin only (task 14): when present, one hold row per
 * currently-free candidate is expected (from /holds recomputing team
 * availability), and only the winner of weighted least-recently-booked is
 * confirmed - every other candidate's hold is released, never confirmed, so
 * it can't linger as a phantom booking claim.
 */
export async function confirmHold(
  holdIds: readonly string[],
  invitee: Invitee,
  executor: Db = getDb(),
  assignment?: RoundRobinAssignment,
  routingAnswers?: RoutingAnswers,
  meeting?: MeetingDetails,
  bookingAnswers?: BookingAnswers,
  offerPublicId?: string,
  expectation?: ConfirmHoldExpectation,
  proposalPublicId?: string,
): Promise<Result<ConfirmedBooking, ConfirmHoldError>> {
  return executor.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(holds)
      .where(inArray(holds.id, [...holdIds]))
      .for("update");

    const foundIds = new Set(rows.map((row) => row.id));
    if (holdIds.length === 0 || !holdIds.every((id) => foundIds.has(id))) {
      return err({ kind: "not_found" });
    }

    const now = Temporal.Now.instant();
    for (const row of rows) {
      if (row.status !== "active") return err({ kind: "not_active" });
      if (Temporal.Instant.compare(toInstant(row.expiresAt), now) <= 0) {
        return err({ kind: "expired" });
      }
    }

    const [first] = rows;
    if (!first) return err({ kind: "not_found" });
    if (
      (expectation && first.eventTypeId !== expectation.eventTypeId)
      || rows.some((row) =>
        row.eventTypeId !== first.eventTypeId
        || row.slotStart.getTime() !== first.slotStart.getTime()
        || row.slotEnd.getTime() !== first.slotEnd.getTime()
      )
      || new Set(rows.map((row) => row.hostUserId)).size !== rows.length
    ) {
      return err({ kind: "not_found" });
    }

    const startsAt = toInstant(first.slotStart);
    const endsAt = toInstant(first.slotEnd);
    let offerId: string | undefined;
    if (offerPublicId) {
      const [offer] = await tx.select()
        .from(oneOffOffers)
        .where(eq(oneOffOffers.publicId, offerPublicId))
        .for("update");
      const matchesSlot = offer?.slots.some((slot) =>
        Temporal.Instant.compare(Temporal.Instant.from(slot.start), startsAt) === 0
        && Temporal.Instant.compare(Temporal.Instant.from(slot.end), endsAt) === 0
      );
      if (
        !offer
        || offer.status !== "active"
        || offer.expiresAt <= new Date()
        || offer.eventTypeId !== first.eventTypeId
        || (offer.recipientEmail !== null
          && offer.recipientEmail.toLowerCase() !== invitee.email.toLowerCase())
        || !matchesSlot
      ) return err({ kind: "offer_unavailable" });
      offerId = offer.id;
    }
    let proposalId: string | undefined;
    let proposalOptionId: string | undefined;
    if (proposalPublicId) {
      const [proposal] = await tx.select()
        .from(proposals)
        .where(eq(proposals.publicId, proposalPublicId))
        .for("update");
      const option = proposal?.options.find((candidate) =>
        Temporal.Instant.compare(Temporal.Instant.from(candidate.start), startsAt) === 0
        && Temporal.Instant.compare(Temporal.Instant.from(candidate.end), endsAt) === 0
        && candidate.hostUserIds.length === rows.length
        && candidate.hostUserIds.every((hostId) =>
          rows.some((row) => row.hostUserId === hostId)
        )
      );
      if (
        !proposal
        || proposal.status !== "awaiting_client"
        || proposal.expiresAt <= new Date()
        || proposal.eventTypeId !== first.eventTypeId
        || proposal.recipientEmail.toLowerCase() !== invitee.email.toLowerCase()
        || !option
      ) return err({ kind: "proposal_unavailable" });
      proposalId = proposal.id;
      proposalOptionId = option.id;
    }
    const [eventType] = await tx
      .select({ workspaceId: eventTypes.workspaceId })
      .from(eventTypes)
      .where(eq(eventTypes.id, first.eventTypeId));
    if (!eventType) return err({ kind: "not_found" });

    let hostUserIds = rows.map((row) => row.hostUserId);
    let holdIdsToConfirm = [...holdIds];
    let assignmentExplanation: AssignmentExplanation | undefined;

    if (assignment) {
      const eligible = assignment.candidates.filter((c) => hostUserIds.includes(c.userId));
      const explanation = buildAssignmentExplanation(
        { start: startsAt, end: endsAt },
        eligible,
        assignment.history,
      );
      if (!explanation) return err({ kind: "not_found" });
      const winner = explanation.winnerUserId;
      const winningRow = winner ? rows.find((row) => row.hostUserId === winner) : undefined;
      if (!winningRow) return err({ kind: "not_found" });
      assignmentExplanation = explanation;

      const losingHoldIds = rows.filter((row) => row.id !== winningRow.id).map((row) => row.id);
      if (losingHoldIds.length > 0) {
        await tx.update(holds).set({ status: "released" }).where(inArray(holds.id, losingHoldIds));
      }

      hostUserIds = [winningRow.hostUserId];
      holdIdsToConfirm = [winningRow.id];
    }
    const bookingLocation = meeting?.location
      ? resolveBookingLocation(meeting.location, hostUserIds[0])
      : null;

    const [booking] = await tx
      .insert(bookings)
      .values({
        workspaceId: eventType.workspaceId,
        eventTypeId: first.eventTypeId,
        startsAt: first.slotStart,
        endsAt: first.slotEnd,
        inviteeEmail: invitee.email,
        inviteeName: invitee.name,
        inviteeTimezone: invitee.timezone,
        inviteeNotes: invitee.notes ?? null,
        meetingFormat: meeting?.format ?? null,
        inviteePhone: meeting?.phone ?? null,
        bookingLocation,
        hostUserIds,
        rescheduleToken: generateToken(),
        cancelToken: generateToken(),
        routingAnswers: routingAnswers ?? null,
        bookingAnswers: bookingAnswers ?? {},
      })
      .returning();
    if (!booking) throw new Error("booking insert returned no row");

    const created = await appendEvent(
      booking.id,
      "created",
      {
        startsAt,
        endsAt,
        hostUserIds,
        ...(routingAnswers ? { routingAnswers } : {}),
        ...(bookingAnswers ? { bookingAnswers } : {}),
        ...(bookingLocation ? { bookingLocation } : {}),
        ...(meeting ? { meeting } : {}),
        ...(assignmentExplanation ? { assignment: assignmentExplanation } : {}),
      },
      tx,
    );
    if (!created.ok) throw new Error(`failed to append created event: ${created.error.reason}`);

    await tx.update(holds).set({ status: "confirmed" }).where(inArray(holds.id, holdIdsToConfirm));
    if (offerId) {
      await tx.update(oneOffOffers)
        .set({ status: "booked", bookingId: booking.id })
        .where(eq(oneOffOffers.id, offerId));
    }
    if (proposalId && proposalOptionId) {
      await tx.update(proposals)
        .set({
          status: "accepted",
          acceptedOptionId: proposalOptionId,
          bookingId: booking.id,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));
      await tx.insert(schema.proposalEvents).values({
        proposalId,
        kind: "accepted",
        actorType: "client",
        detail: { optionId: proposalOptionId, bookingId: booking.id },
      });
    }

    return ok({ bookingId: booking.id, hostUserIds });
  });
}

/**
 * Reschedule's "confirm" step (task 14): same FOR-UPDATE re-verification as
 * confirmHold, but the booking already exists, so this appends a
 * "rescheduled" event (booking-repo, task 11) instead of inserting a new
 * bookings row. Illegal transitions (cancelled/no_show) surface as the typed
 * BookingStateError, not a generic failure.
 */
export async function confirmReschedule(
  bookingId: string,
  holdIds: readonly string[],
  executor: Db = getDb(),
): Promise<Result<BookingState, ConfirmHoldError | BookingStateError>> {
  return executor.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(holds)
      .where(inArray(holds.id, [...holdIds]))
      .for("update");

    const foundIds = new Set(rows.map((row) => row.id));
    if (holdIds.length === 0 || !holdIds.every((id) => foundIds.has(id))) {
      return err({ kind: "not_found" });
    }

    const now = Temporal.Now.instant();
    for (const row of rows) {
      if (row.status !== "active") return err({ kind: "not_active" });
      if (Temporal.Instant.compare(toInstant(row.expiresAt), now) <= 0) {
        return err({ kind: "expired" });
      }
    }

    const [first] = rows;
    if (!first) return err({ kind: "not_found" });
    if (
      rows.some((row) =>
        row.eventTypeId !== first.eventTypeId
        || row.slotStart.getTime() !== first.slotStart.getTime()
        || row.slotEnd.getTime() !== first.slotEnd.getTime()
      )
      || new Set(rows.map((row) => row.hostUserId)).size !== rows.length
    ) {
      return err({ kind: "not_found" });
    }
    const [booking] = await tx.select({ eventTypeId: bookings.eventTypeId })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    if (!booking || booking.eventTypeId !== first.eventTypeId) {
      return err({ kind: "not_found" });
    }

    const startsAt = toInstant(first.slotStart);
    const endsAt = toInstant(first.slotEnd);

    const rescheduled = await appendEvent(bookingId, "rescheduled", { startsAt, endsAt }, tx);
    if (!rescheduled.ok) return rescheduled;

    const nextHostUserIds = [...new Set(rows.map((row) => row.hostUserId))];
    const hostsChanged =
      nextHostUserIds.length !== rescheduled.value.hostUserIds.length ||
      nextHostUserIds.some((id, index) => id !== rescheduled.value.hostUserIds[index]);
    const finalState = hostsChanged
      ? await appendEvent(bookingId, "reassigned", { hostUserIds: nextHostUserIds }, tx)
      : rescheduled;
    if (!finalState.ok) return finalState;

    await tx.update(holds).set({ status: "confirmed" }).where(inArray(holds.id, [...holdIds]));

    return finalState;
  });
}

/** Releases expired active holds. Called periodically by pg-boss. */
export async function expireHolds(now: Temporal.Instant, executor: Db = getDb()): Promise<number> {
  const rows = await executor
    .update(holds)
    .set({ status: "expired" })
    .where(and(eq(holds.status, "active"), lte(holds.expiresAt, toDate(now))))
    .returning({ id: holds.id });

  return rows.length;
}

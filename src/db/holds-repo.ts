import { and, eq, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import { bookings, holds } from "./schema";
import * as schema from "./schema";
import { ok, err, type Result } from "../lib/result";
import { generateToken } from "../lib/id";
import { appendEvent } from "./booking-repo";
import { assign, type AssignmentCandidate, type BookingRecord } from "../core/assignment/round-robin";
import type { BookingState, BookingStateError } from "../core/booking/state";
import type { RoutingAnswers } from "../core/routing/condition";

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
}

export type ConfirmHoldError =
  | { readonly kind: "not_found" }
  | { readonly kind: "expired" }
  | { readonly kind: "not_active" };

export interface ConfirmedBooking {
  readonly bookingId: string;
  readonly hostUserIds: readonly string[];
}

function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function toInstant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * Inserts one active hold per host inside a single transaction. The partial
 * unique index on (host_user_id, slot_start) WHERE status = 'active' is what
 * actually adjudicates a race between two concurrent callers; a losing insert
 * throws a unique-violation that this maps to err("slot_taken"). For group
 * bookings every host's hold must land or none does, so any failure aborts
 * the whole transaction (thrown errors roll it back automatically).
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

  try {
    const inserted = await executor.transaction(async (tx) => {
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

    return ok(inserted);
  } catch (error) {
    if (isUniqueViolation(error)) return err({ kind: "slot_taken" });
    throw error;
  }
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

    const startsAt = toInstant(first.slotStart);
    const endsAt = toInstant(first.slotEnd);

    let hostUserIds = rows.map((row) => row.hostUserId);
    let holdIdsToConfirm = [...holdIds];

    if (assignment) {
      const eligible = assignment.candidates.filter((c) => hostUserIds.includes(c.userId));
      const winner = assign({ start: startsAt, end: endsAt }, eligible, assignment.history);
      const winningRow = winner ? rows.find((row) => row.hostUserId === winner) : undefined;
      if (!winningRow) return err({ kind: "not_found" });

      const losingHoldIds = rows.filter((row) => row.id !== winningRow.id).map((row) => row.id);
      if (losingHoldIds.length > 0) {
        await tx.update(holds).set({ status: "released" }).where(inArray(holds.id, losingHoldIds));
      }

      hostUserIds = [winningRow.hostUserId];
      holdIdsToConfirm = [winningRow.id];
    }

    const [booking] = await tx
      .insert(bookings)
      .values({
        eventTypeId: first.eventTypeId,
        startsAt: first.slotStart,
        endsAt: first.slotEnd,
        inviteeEmail: invitee.email,
        inviteeName: invitee.name,
        inviteeTimezone: invitee.timezone,
        hostUserIds,
        rescheduleToken: generateToken(),
        cancelToken: generateToken(),
        routingAnswers: routingAnswers ?? null,
      })
      .returning();
    if (!booking) throw new Error("booking insert returned no row");

    const created = await appendEvent(
      booking.id,
      "created",
      { startsAt, endsAt, hostUserIds, ...(routingAnswers ? { routingAnswers } : {}) },
      tx,
    );
    if (!created.ok) throw new Error(`failed to append created event: ${created.error.reason}`);

    await tx.update(holds).set({ status: "confirmed" }).where(inArray(holds.id, holdIdsToConfirm));

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

    const startsAt = toInstant(first.slotStart);
    const endsAt = toInstant(first.slotEnd);

    const rescheduled = await appendEvent(bookingId, "rescheduled", { startsAt, endsAt }, tx);
    if (!rescheduled.ok) return rescheduled;

    await tx.update(holds).set({ status: "confirmed" }).where(inArray(holds.id, [...holdIds]));

    return rescheduled;
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

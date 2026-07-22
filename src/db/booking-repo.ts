import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import { bookingEvents, bookings } from "./schema";
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

type Db = NodePgDatabase<typeof schema>;

type StoredPayload = Record<string, unknown>;

function serializePayload(event: BookingEvent): StoredPayload {
  switch (event.kind) {
    case "created":
      return {
        startsAt: event.payload.startsAt.toString(),
        endsAt: event.payload.endsAt.toString(),
        hostUserIds: event.payload.hostUserIds,
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
    case "created":
      return {
        kind: "created",
        payload: {
          startsAt: Temporal.Instant.from(payload["startsAt"] as string),
          endsAt: Temporal.Instant.from(payload["endsAt"] as string),
          hostUserIds: payload["hostUserIds"] as string[],
        },
      };
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

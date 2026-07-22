import type { Temporal } from "@js-temporal/polyfill";
import { ok, err, type Result } from "../../lib/result";
import type { RoutingAnswers } from "../routing/condition";

/** Mirrors docs/SCHEMA.md `booking_event_kind`. Duplicated, not imported from
 * src/db/schema: core must not depend on the database layer. */
export type BookingEventKind =
  | "created"
  | "rescheduled"
  | "cancelled"
  | "reassigned"
  | "no_show"
  | "invite_sent"
  | "invite_delivered"
  | "invite_failed";

export interface CreatedPayload {
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly hostUserIds: readonly string[];
  /** present when the invitee arrived via a routing form */
  readonly routingAnswers?: RoutingAnswers;
}

export interface RescheduledPayload {
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
}

export interface CancelledPayload {
  readonly reason?: string;
}

export interface ReassignedPayload {
  readonly hostUserIds: readonly string[];
}

export type NoShowPayload = Record<string, never>;
export type InviteSentPayload = Record<string, never>;
export type InviteDeliveredPayload = Record<string, never>;

export interface InviteFailedPayload {
  readonly reason?: string;
}

export type BookingEvent =
  | { readonly kind: "created"; readonly payload: CreatedPayload }
  | { readonly kind: "rescheduled"; readonly payload: RescheduledPayload }
  | { readonly kind: "cancelled"; readonly payload: CancelledPayload }
  | { readonly kind: "reassigned"; readonly payload: ReassignedPayload }
  | { readonly kind: "no_show"; readonly payload: NoShowPayload }
  | { readonly kind: "invite_sent"; readonly payload: InviteSentPayload }
  | { readonly kind: "invite_delivered"; readonly payload: InviteDeliveredPayload }
  | { readonly kind: "invite_failed"; readonly payload: InviteFailedPayload };

/** Extracts the payload type for a given event kind, for callers that build
 * one event at a time (e.g. a db-layer appendEvent(bookingId, kind, payload)). */
export type BookingEventPayload<K extends BookingEventKind> = Extract<BookingEvent, { kind: K }>["payload"];

export type BookingLifecycleStatus = "confirmed" | "cancelled" | "no_show";
export type InviteStatus = "none" | "sent" | "delivered" | "failed";

export interface BookingState {
  readonly status: BookingLifecycleStatus;
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly hostUserIds: readonly string[];
  readonly inviteStatus: InviteStatus;
}

export type BookingStateErrorReason =
  | "already_created"
  | "not_created"
  | "already_cancelled"
  | "already_no_show"
  | "booking_cancelled"
  | "booking_no_show"
  | "invite_not_sent"
  | "empty_history";

export interface BookingStateError {
  readonly kind: BookingEventKind | null;
  readonly reason: BookingStateErrorReason;
}

function illegal(kind: BookingEventKind, reason: BookingStateErrorReason): Result<BookingState, BookingStateError> {
  return err({ kind, reason });
}

/**
 * Applies one event to the current state (null = no "created" event yet).
 * Illegal transitions (double create, any event before create, edits after
 * cancelled/no_show, cancelling/no-showing twice, invite delivery/failure
 * before send) are rejected with a typed reason instead of silently mutating.
 */
export function applyEvent(
  state: BookingState | null,
  event: BookingEvent,
): Result<BookingState, BookingStateError> {
  if (event.kind === "created") {
    if (state !== null) return illegal(event.kind, "already_created");
    return ok({
      status: "confirmed",
      startsAt: event.payload.startsAt,
      endsAt: event.payload.endsAt,
      hostUserIds: event.payload.hostUserIds,
      inviteStatus: "none",
    });
  }

  if (state === null) return illegal(event.kind, "not_created");

  switch (event.kind) {
    case "rescheduled": {
      if (state.status === "cancelled") return illegal(event.kind, "booking_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "booking_no_show");
      return ok({ ...state, startsAt: event.payload.startsAt, endsAt: event.payload.endsAt });
    }

    case "cancelled": {
      if (state.status === "cancelled") return illegal(event.kind, "already_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "booking_no_show");
      return ok({ ...state, status: "cancelled" });
    }

    case "reassigned": {
      if (state.status === "cancelled") return illegal(event.kind, "booking_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "booking_no_show");
      return ok({ ...state, hostUserIds: event.payload.hostUserIds });
    }

    case "no_show": {
      if (state.status === "cancelled") return illegal(event.kind, "booking_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "already_no_show");
      return ok({ ...state, status: "no_show" });
    }

    case "invite_sent": {
      if (state.status === "cancelled") return illegal(event.kind, "booking_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "booking_no_show");
      return ok({ ...state, inviteStatus: "sent" });
    }

    case "invite_delivered": {
      if (state.status === "cancelled") return illegal(event.kind, "booking_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "booking_no_show");
      if (state.inviteStatus !== "sent") return illegal(event.kind, "invite_not_sent");
      return ok({ ...state, inviteStatus: "delivered" });
    }

    case "invite_failed": {
      if (state.status === "cancelled") return illegal(event.kind, "booking_cancelled");
      if (state.status === "no_show") return illegal(event.kind, "booking_no_show");
      if (state.inviteStatus !== "sent") return illegal(event.kind, "invite_not_sent");
      return ok({ ...state, inviteStatus: "failed" });
    }
  }
}

/** Folds a full event history into the current state. An empty history is
 * itself an error: there is no booking without a "created" event. */
export function projectState(events: readonly BookingEvent[]): Result<BookingState, BookingStateError> {
  if (events.length === 0) return err({ kind: null, reason: "empty_history" });

  let state: BookingState | null = null;
  for (const event of events) {
    const result = applyEvent(state, event);
    if (!result.ok) return result;
    state = result.value;
  }
  return ok(state as BookingState);
}

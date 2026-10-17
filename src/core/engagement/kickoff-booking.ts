import type { BookingStateError, BookingStateErrorReason } from "@calpaca/core";

// Full calendar sync covers 90 days and is required to be at most 7 days
// old. Reserve only 60 days ahead, preserving a buffer before cache coverage.
export const PROTECTED_RESERVATION_WINDOW_DAYS = 60;

export type KickoffBookingError =
  | "followup_not_enabled"
  | "followup_occurrence_mismatch"
  | "followup_approval_stale"
  | "followup_managed_schedule"
  | "kickoff_already_booked"
  | "kickoff_not_published"
  | "kickoff_engagement_inactive"
  | "kickoff_configuration_changed"
  | "kickoff_roster_mismatch"
  | "kickoff_setup_incomplete"
  | "kickoff_slot_unavailable"
  | "kickoff_calendar_coverage_incomplete";

/** The booking lifecycle error as the app reports it: the engine's own
 * reasons plus the kickoff/follow-up guards layered on in the database layer. */
export type AppBookingStateError = BookingStateError<
  | BookingStateErrorReason
  | "kickoff_delivery_receipt_required"
  | "kickoff_delivery_superseded"
  | KickoffBookingError
>;

export function sameRoster(actual: readonly string[], required: readonly string[]) {
  return actual.length === required.length && new Set(actual).size === actual.length
    && required.every(id => actual.includes(id));
}

export function organizerFirst(required: readonly string[], organizer: string) {
  return [organizer, ...required.filter(id => id !== organizer).sort()];
}

// Full calendar sync covers 90 days and is required to be at most 7 days
// old. Reserve only 60 days ahead, preserving a buffer before cache coverage.
export const PROTECTED_RESERVATION_WINDOW_DAYS = 60;

export type KickoffBookingError =
  | "followup_not_enabled"
  | "followup_occurrence_mismatch"
  | "followup_approval_stale"
  | "followup_managed_schedule"
  | "kickoff_not_published"
  | "kickoff_engagement_inactive"
  | "kickoff_configuration_changed"
  | "kickoff_roster_mismatch"
  | "kickoff_setup_incomplete"
  | "kickoff_slot_unavailable"
  | "kickoff_calendar_coverage_incomplete";

export function sameRoster(actual: readonly string[], required: readonly string[]) {
  return actual.length === required.length && new Set(actual).size === actual.length
    && required.every(id => actual.includes(id));
}

export function organizerFirst(required: readonly string[], organizer: string) {
  return [organizer, ...required.filter(id => id !== organizer).sort()];
}

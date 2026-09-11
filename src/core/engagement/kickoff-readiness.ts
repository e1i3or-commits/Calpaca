import { isIanaZone } from "../../lib/timezone";
import { Temporal } from "@js-temporal/polyfill";
import type { WeeklyRule } from "../availability/rules";
import type { ScheduleOverride } from "../availability/overrides";

// Three missed 15-minute sync sweeps block onboarding setup. This is a
// configuration check, never a substitute for checking a selected slot.
export const KICKOFF_SYNC_MAX_AGE_MS = 45 * 60 * 1000;
export const KICKOFF_FULL_SYNC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export interface KickoffCalendarEvidence {
  conflictEnabled: boolean;
  isWriteDestination: boolean;
  syncHealthy: boolean;
  lastSyncedAt: Date | null;
  fullSyncedAt: Date | null;
}
export interface KickoffParticipantEvidence {
  userId: string;
  name: string;
  active: boolean;
  schedules: { timezone: string; rules: readonly WeeklyRule[]; overrides: readonly ScheduleOverride[] }[];
  calendars: KickoffCalendarEvidence[];
}
const messages = {
  participant_inactive: "Activate this person's account and workspace membership.",
  schedule_missing: "Add an availability schedule.",
  schedule_ambiguous: "Resolve multiple availability schedules before booking.",
  schedule_invalid: "Correct the availability schedule's timezone or working hours.",
  schedule_forwarding: "Resolve availability forwarding so this person attends the kickoff.",
  calendar_missing: "Connect a calendar and enable conflict checking.",
  calendar_unhealthy: "Repair calendar sync.",
  calendar_stale: "Refresh calendar availability.",
  calendar_baseline_stale: "Run a full calendar sync.",
  organizer_not_in_roster: "Select a kickoff participant as organizer.",
  organizer_calendar_missing: "Choose the organizer's calendar for meeting invitations.",
  organizer_calendar_ambiguous: "Resolve multiple organizing calendars.",
} as const;
export type KickoffSetupIssue = { code: keyof typeof messages; message: string };
const issue = (code: keyof typeof messages): KickoffSetupIssue => ({ code, message: messages[code] });
const recent = (date: Date | null, now: Date, maxAge: number) => date !== null
  && Number.isFinite(date.getTime()) && date.getTime() <= now.getTime()
  && now.getTime() - date.getTime() <= maxAge;

function calendarIssues(calendars: KickoffCalendarEvidence[], now: Date): KickoffSetupIssue[] {
  return [
    ...(!calendars.every(calendar => calendar.syncHealthy) ? [issue("calendar_unhealthy")] : []),
    ...(!calendars.every(calendar => recent(calendar.lastSyncedAt, now, KICKOFF_SYNC_MAX_AGE_MS)) ? [issue("calendar_stale")] : []),
    ...(!calendars.every(calendar => recent(calendar.fullSyncedAt, now, KICKOFF_FULL_SYNC_MAX_AGE_MS)) ? [issue("calendar_baseline_stale")] : []),
  ];
}

/** All six entries are retained, including people whose setup is incomplete.
 * Only stored, non-secret evidence is considered; no provider writes occur. */
export function evaluateKickoffReadiness(evidence: KickoffParticipantEvidence[], organizerUserId: string, now: Date, requiredUserIds?: readonly string[]) {
  const participants = evidence.map(person => {
    const issues: KickoffSetupIssue[] = [];
    if (!person.active) issues.push(issue("participant_inactive"));
    if (person.schedules.length === 0) issues.push(issue("schedule_missing"));
    else if (person.schedules.length !== 1) issues.push(issue("schedule_ambiguous"));
    else {
      const schedule = person.schedules[0]!;
      const time = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
      const validTimezone = isIanaZone(schedule.timezone);
      const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(validTimezone ? schedule.timezone : "UTC").toPlainDate().toString();
      const hasOpenHours = schedule.rules.length > 0 || schedule.overrides.some(override => override.kind === "available"
        && override.endDate >= today && override.start && override.end && override.start !== override.end);
      if (!validTimezone || !hasOpenHours || !schedule.rules.every(rule =>
        Number.isInteger(rule.dow) && rule.dow >= 1 && rule.dow <= 7
        && time.test(rule.start) && time.test(rule.end) && rule.start !== rule.end)) issues.push(issue("schedule_invalid"));
      // A forwarding override cannot substitute someone for an approved host.
      if (schedule.overrides.some(override => override.forwardToUserId && override.endDate >= today)) issues.push(issue("schedule_forwarding"));
    }
    const calendars = person.calendars.filter(calendar => calendar.conflictEnabled);
    if (!calendars.length) issues.push(issue("calendar_missing"));
    else issues.push(...calendarIssues(calendars, now));
    return { userId: person.userId, name: person.name, required: requiredUserIds ? requiredUserIds.includes(person.userId) : true, ready: issues.length === 0, issues };
  });
  const organizer = evidence.find(person => person.userId === organizerUserId);
  const organizingCalendars = organizer?.calendars.filter(calendar => calendar.isWriteDestination) ?? [];
  const organizerIssues: KickoffSetupIssue[] = [];
  if (!organizer) organizerIssues.push(issue("organizer_not_in_roster"));
  if (!organizingCalendars.length) organizerIssues.push(issue("organizer_calendar_missing"));
  else if (organizingCalendars.length !== 1) organizerIssues.push(issue("organizer_calendar_ambiguous"));
  else organizerIssues.push(...calendarIssues(organizingCalendars, now));
  return {
    checkedAt: now.toISOString(),
    calendarSetupReady: participants.length === 6 && new Set(participants.map(person => person.userId)).size === 6
      && participants.filter(person => person.required).every(person => person.ready)
      && participants.every(person => !person.issues.some(issue => issue.code === "participant_inactive"))
      && (!requiredUserIds || (requiredUserIds.length === 4 && new Set(requiredUserIds).size === 4 && requiredUserIds.every(id => participants.some(person => person.userId === id))))
      && organizerIssues.length === 0,
    participants,
    organizer: { userId: organizerUserId, ready: organizerIssues.length === 0, issues: organizerIssues },
    // Calendar setup is only one prerequisite. Do not release a welcome email
    // until publication, confirmation and invitation delivery are implemented.
    canPublish: false as const,
    kickoffBookingUrl: null,
    remainingSteps: ["kickoff_publication", "fixed_roster_confirmation", "verified_invitation_delivery"],
  };
}

/**
 * An Engagement read as a meeting series: every meeting it owns, in time
 * order, with one state a person can read ("held", "booked", "planned"), and
 * the progress figures an outside dashboard shows per row.
 *
 * Pure: the repository loads rows and the clock, this decides what they mean.
 * Planned follow-up dates and confirmed bookings stay distinct here, exactly
 * as in FOLLOWUP-SCHEDULE.md: a draft date is never reported as a meeting.
 */

export const seriesMeetingKinds = ["kickoff", "followup", "checkin", "one_off", "conversation"] as const;
export type SeriesMeetingKind = (typeof seriesMeetingKinds)[number];

export type SeriesMeetingState =
  /** A future follow-up date with no booking yet. */
  | "planned"
  /** A follow-up date held back by a paused schedule. */
  | "paused"
  /** A confirmed booking that has not ended. */
  | "booked"
  /** A confirmed booking that has ended. */
  | "held"
  | "no_show"
  | "cancelled"
  /** A follow-up date that passed without a booking. */
  | "unbooked";

export interface SeriesMeeting {
  /** The occurrence id for follow-ups, otherwise the booking id. */
  readonly id: string;
  readonly kind: SeriesMeetingKind;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly state: SeriesMeetingState;
  readonly bookingId: string | null;
  /** Set on follow-ups: the id the follow-up schedule's move and skip commands take. */
  readonly occurrenceId: string | null;
  /** A follow-up moved on its own, kept when the series changes. */
  readonly exception: boolean;
  readonly inviteStatus: string | null;
  readonly inviteeName: string | null;
  /** The booking's hosts; empty for a date that has no booking. */
  readonly hostUserIds: readonly string[];
}

export interface BookingInput {
  readonly id: string;
  readonly eventTypeId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: string;
  readonly inviteStatus: string;
  readonly inviteeName: string;
  readonly hostUserIds: readonly string[];
}

export interface OccurrenceInput {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: "draft" | "paused" | "cancelled";
  readonly exception: boolean;
  /** The current booking generation for this date, when one was reserved. */
  readonly booking: BookingInput | null;
}

export interface EventTypeInput {
  readonly id: string;
  readonly title: string;
  readonly kind: SeriesMeetingKind;
}

export function bookingState(b: Pick<BookingInput, "status" | "endsAt">, now: Date): SeriesMeetingState {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "no_show") return "no_show";
  return b.endsAt.getTime() <= now.getTime() ? "held" : "booked";
}

/** The occurrence decides first: a removed or paused date is that, whatever its booking still says while the cancellation is sent. */
export function occurrenceState(o: OccurrenceInput, now: Date): SeriesMeetingState {
  if (o.status === "cancelled") return "cancelled";
  if (o.booking && o.booking.status !== "cancelled") return bookingState(o.booking, now);
  if (o.status === "paused") return "paused";
  return o.endsAt.getTime() <= now.getTime() ? "unbooked" : "planned";
}

/**
 * Every meeting of one Engagement, earliest first. Bookings of the follow-up
 * event type appear only through their occurrence, so a cancelled booking
 * generation that was replaced is not counted twice.
 */
export function seriesMeetings(input: {
  readonly eventTypes: readonly EventTypeInput[];
  readonly bookings: readonly BookingInput[];
  readonly occurrences: readonly OccurrenceInput[];
  readonly followupTitle: string;
  readonly now: Date;
}): SeriesMeeting[] {
  const types = new Map(input.eventTypes.map((t) => [t.id, t]));
  const fromBookings: SeriesMeeting[] = input.bookings.flatMap((b) => {
    const t = types.get(b.eventTypeId);
    if (!t || t.kind === "followup") return [];
    return [{
      id: b.id, kind: t.kind, title: t.title,
      startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(),
      state: bookingState(b, input.now), bookingId: b.id, occurrenceId: null, exception: false,
      inviteStatus: b.inviteStatus, inviteeName: b.inviteeName, hostUserIds: b.hostUserIds,
    }];
  });
  const fromOccurrences: SeriesMeeting[] = input.occurrences.map((o) => ({
    id: o.id, kind: "followup", title: input.followupTitle,
    startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString(),
    state: occurrenceState(o, input.now), bookingId: o.booking?.id ?? null, occurrenceId: o.id, exception: o.exception,
    inviteStatus: o.booking?.inviteStatus ?? null, inviteeName: o.booking?.inviteeName ?? null,
    hostUserIds: o.booking?.hostUserIds ?? [],
  }));
  return [...fromBookings, ...fromOccurrences].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

export interface SeriesProgress {
  /** Meetings that took place. */
  readonly held: number;
  /** Held, plus every meeting still to come: cancelled, skipped and missed dates are not part of the plan. */
  readonly total: number;
  readonly noShows: number;
  /** The next booked or planned meeting, or one running now. */
  readonly next: SeriesMeeting | null;
  readonly lastHeld: SeriesMeeting | null;
}

export function seriesProgress(meetings: readonly SeriesMeeting[], now: Date): SeriesProgress {
  const held = meetings.filter((m) => m.state === "held");
  const ahead = meetings.filter((m) => ["booked", "planned", "paused"].includes(m.state));
  const next = ahead.find((m) => (m.state === "booked" || m.state === "planned") && Date.parse(m.endsAt) > now.getTime()) ?? null;
  return {
    held: held.length,
    total: held.length + ahead.length,
    noShows: meetings.filter((m) => m.state === "no_show").length,
    next,
    lastHeld: held[held.length - 1] ?? null,
  };
}

/**
 * Where a franchise onboarding stands, in order: the kickoff is not held yet,
 * follow-ups are running, the three-month check-in is next, or nothing is
 * left to meet about. Null for an Engagement that is not an onboarding.
 */
export type OnboardingStage = "kickoff" | "followups" | "checkin" | "complete";

export function onboardingStage(meetings: readonly SeriesMeeting[], scheduleStatus: "planned" | "paused" | "ended" | null): OnboardingStage {
  const kickoffHeld = meetings.some((m) => m.kind === "kickoff" && m.state === "held");
  if (!kickoffHeld) return "kickoff";
  const followupsAhead = meetings.some((m) => m.kind === "followup" && ["booked", "planned", "paused"].includes(m.state));
  if (scheduleStatus !== "ended" && (followupsAhead || scheduleStatus === null)) return "followups";
  const checkinHeld = meetings.some((m) => m.kind === "checkin" && m.state === "held");
  return checkinHeld ? "complete" : "checkin";
}

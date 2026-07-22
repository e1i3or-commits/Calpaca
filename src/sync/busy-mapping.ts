import { Temporal } from "@js-temporal/polyfill";

// Pure mapping from Google Calendar event resources (singleEvents=true, so
// recurrences arrive pre-expanded) to busy-cache changes. No I/O: the
// engine feeds events in, the repo applies the changes.

export type GoogleEventTime = {
  dateTime?: string; // RFC3339 with offset, timed events
  date?: string;     // YYYY-MM-DD, all-day events (end date exclusive)
  timeZone?: string;
};

export type GoogleEvent = {
  id: string;
  status?: string;       // confirmed | tentative | cancelled
  transparency?: string; // "transparent" = shows as free
  eventType?: string;    // default | outOfOffice | focusTime | workingLocation | birthday
  start?: GoogleEventTime;
  end?: GoogleEventTime;
};

export type BusyChange =
  | { kind: "upsert"; externalEventId: string; startsAt: Date; endsAt: Date }
  | { kind: "delete"; externalEventId: string };

// Event kinds that never block time regardless of transparency flags.
const NON_BLOCKING_EVENT_TYPES = new Set(["workingLocation", "birthday"]);

/**
 * calendarTimezone anchors all-day events: Google gives them as plain dates,
 * and "busy on July 4" means midnight-to-midnight in the calendar's zone.
 * Temporal resolves DST there (a 23h or 25h day stays midnight-to-midnight).
 *
 * Returns null when the event carries no time information at all.
 * Cancelled and free (transparent) events map to a delete so an event that
 * *became* free clears its cached row; deletes for rows that never existed
 * are no-ops in the repo.
 */
export function mapEventToBusyChange(
  event: GoogleEvent,
  calendarTimezone: string,
): BusyChange | null {
  if (
    event.status === "cancelled" ||
    event.transparency === "transparent" ||
    NON_BLOCKING_EVENT_TYPES.has(event.eventType ?? "")
  ) {
    return { kind: "delete", externalEventId: event.id };
  }

  const startsAt = toInstant(event.start, calendarTimezone);
  const endsAt = toInstant(event.end, calendarTimezone);
  if (!startsAt || !endsAt) return null;
  if (endsAt.getTime() <= startsAt.getTime()) return null;

  return { kind: "upsert", externalEventId: event.id, startsAt, endsAt };
}

function toInstant(time: GoogleEventTime | undefined, calendarTimezone: string): Date | null {
  if (!time) return null;
  if (time.dateTime) {
    return new Date(Temporal.Instant.from(time.dateTime).epochMilliseconds);
  }
  if (time.date) {
    const zdt = Temporal.PlainDate.from(time.date).toZonedDateTime({
      timeZone: time.timeZone ?? calendarTimezone,
      plainTime: "00:00",
    });
    return new Date(zdt.epochMilliseconds);
  }
  return null;
}

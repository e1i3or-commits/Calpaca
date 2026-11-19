import type { FollowupMoveAvailability } from "./api";

export interface FollowupMoveHint { busy: string | null; summary: string }

/** Explains a day in the move picker: when the required team is busy and why a time is missing. */
export function followupMoveHint(availability: FollowupMoveAvailability, timezone: string): FollowupMoveHint {
  const time = new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  const busyRanges = availability.teamBusy.map(block => time.formatRange(new Date(block.start), new Date(block.end)));
  const busy = busyRanges.length ? `A required teammate is busy: ${busyRanges.join(", ")}.` : null;
  const [first] = availability.slots;
  if (first) return { busy, summary: `First open time: ${time.format(new Date(first.start))}.` };
  if (busyRanges.length) return { busy, summary: `No ${availability.durationMinutes}-minute gap when the whole required team is free on this date. Choose another date, or free up one of the busy times.` };
  return { busy, summary: "No time is open for the whole required team on this date, for example a weekend, holiday, closed day or too soon to book. Choose another date." };
}

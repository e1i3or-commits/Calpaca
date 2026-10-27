import { Temporal } from "@js-temporal/polyfill";
import type { Interval } from "@calpaca/core";
import type { BookingWindow } from "./booking-window-schema";

/** Additional per-link limits. Never replaces a host's calendar or working hours. */
export function withinBookingWindow(slot: Interval, limits?: BookingWindow | null): boolean {
  if (!limits) return true;
  const start = slot.start.toZonedDateTimeISO(limits.timezone);
  // End is exclusive: a meeting ending at midnight belongs to the previous date.
  const last = slot.end.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(limits.timezone);
  const date = start.toPlainDate().toString();
  if (date !== last.toPlainDate().toString()) return false;
  if (limits.startDate && date < limits.startDate) return false;
  if (limits.endDate && date > limits.endDate) return false;
  if (limits.excludedDates.includes(date)) return false;
  if (limits.weeklyWindows === null) return true;
  return limits.weeklyWindows.some((rule) => {
    if (rule.dow !== start.dayOfWeek % 7) return false;
    const day = start.toPlainDate();
    const from = day.toPlainDateTime(Temporal.PlainTime.from(rule.start)).toZonedDateTime(limits.timezone).toInstant();
    const to = day.toPlainDateTime(Temporal.PlainTime.from(rule.end)).toZonedDateTime(limits.timezone).toInstant();
    return Temporal.Instant.compare(slot.start, from) >= 0 && Temporal.Instant.compare(slot.end, to) <= 0;
  });
}

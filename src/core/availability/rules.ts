import { Temporal } from "@js-temporal/polyfill";
import { clamp, type Interval } from "./intervals";

/**
 * A recurring weekly working-hours rule, per docs/SCHEMA.md `schedules.rules`.
 * `dow` follows Temporal's ISO day-of-week numbering: 1 (Monday) .. 7 (Sunday).
 * `start`/`end` are local "HH:MM". `end <= start` means the rule spans past
 * midnight into the next day (e.g. a 22:00-02:00 overnight shift).
 */
export interface WeeklyRule {
  readonly dow: number;
  readonly start: string;
  readonly end: string;
}

/**
 * Expands weekly rules, interpreted in `timezone`, into concrete UTC open
 * intervals clamped to `window`. Expansion happens in local wall-clock time
 * via Temporal.ZonedDateTime so DST transitions land on the correct Instant:
 * a gap (spring-forward) shortens the elapsed UTC duration, a fold
 * (fall-back) lengthens it. Nonexistent local times inside a spring-forward
 * gap resolve with "compatible" disambiguation.
 */
export function expandRules(
  rules: readonly WeeklyRule[],
  timezone: string,
  window: Interval,
): Interval[] {
  if (rules.length === 0) return [];

  const windowStartDate = window.start.toZonedDateTimeISO(timezone).toPlainDate();
  const windowEndDate = window.end.toZonedDateTimeISO(timezone).toPlainDate();

  // Widen by a day on each side: a midnight-crossing rule starting the day
  // before `window` can still overlap it, and `window` may start mid-rule.
  const lastDate = windowEndDate.add({ days: 1 });
  const raw: Interval[] = [];

  for (
    let date = windowStartDate.subtract({ days: 1 });
    Temporal.PlainDate.compare(date, lastDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    for (const rule of rules) {
      if (rule.dow !== date.dayOfWeek) continue;

      const startTime = Temporal.PlainTime.from(rule.start);
      const endTime = Temporal.PlainTime.from(rule.end);
      const crossesMidnight = Temporal.PlainTime.compare(endTime, startTime) < 0;

      const startZdt = date
        .toPlainDateTime(startTime)
        .toZonedDateTime(timezone, { disambiguation: "compatible" });
      const endDate = crossesMidnight ? date.add({ days: 1 }) : date;
      const endZdt = endDate
        .toPlainDateTime(endTime)
        .toZonedDateTime(timezone, { disambiguation: "compatible" });

      raw.push({ start: startZdt.toInstant(), end: endZdt.toInstant() });
    }
  }

  return clamp(raw, window);
}

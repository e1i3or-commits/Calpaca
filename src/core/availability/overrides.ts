import { Temporal } from "@js-temporal/polyfill";
import { clamp, normalize, subtract, type Interval } from "./intervals";
import { expandRules, type WeeklyRule } from "./rules";

export interface ScheduleOverride {
  readonly startDate: string;
  readonly endDate: string;
  readonly kind: "available" | "unavailable";
  readonly start?: string;
  readonly end?: string;
  readonly forwardToUserId?: string | null;
}

function localInterval(
  date: Temporal.PlainDate,
  timezone: string,
  start = "00:00",
  end = "00:00",
): Interval {
  const startsAt = date.toPlainDateTime(Temporal.PlainTime.from(start))
    .toZonedDateTime(timezone, { disambiguation: "compatible" });
  const endDate = end === "00:00" ? date.add({ days: 1 }) : date;
  const endsAt = endDate.toPlainDateTime(Temporal.PlainTime.from(end))
    .toZonedDateTime(timezone, { disambiguation: "compatible" });
  return { start: startsAt.toInstant(), end: endsAt.toInstant() };
}

function dates(startDate: string, endDate: string): Temporal.PlainDate[] {
  const result: Temporal.PlainDate[] = [];
  const end = Temporal.PlainDate.from(endDate);
  for (
    let date = Temporal.PlainDate.from(startDate);
    Temporal.PlainDate.compare(date, end) <= 0;
    date = date.add({ days: 1 })
  ) {
    result.push(date);
  }
  return result;
}

export function forwardingIntervals(
  overrides: readonly ScheduleOverride[],
  timezone: string,
  targetUserId: string,
  window: Interval,
): Interval[] {
  const intervals = overrides.flatMap((override) => {
    if (
      override.kind !== "unavailable" ||
      override.forwardToUserId !== targetUserId
    ) {
      return [];
    }
    return dates(override.startDate, override.endDate).map((date) =>
      localInterval(date, timezone, override.start, override.end),
    );
  });
  return normalize(clamp(intervals, window));
}

/**
 * Applies concrete date exceptions after recurring hours are expanded.
 * Available exceptions replace that date's recurring hours; unavailable
 * exceptions subtract either the whole local day or the named time range.
 */
export function effectiveOpenIntervals(
  rules: readonly WeeklyRule[],
  overrides: readonly ScheduleOverride[],
  timezone: string,
  window: Interval,
): Interval[] {
  let open = expandRules(rules, timezone, window);
  const availableByDate = new Map<string, Interval[]>();
  const unavailable: Interval[] = [];

  for (const override of overrides) {
    for (const date of dates(override.startDate, override.endDate)) {
      if (override.kind === "available") {
        if (!override.start || !override.end) continue;
        const intervals = availableByDate.get(date.toString()) ?? [];
        intervals.push(localInterval(date, timezone, override.start, override.end));
        availableByDate.set(date.toString(), intervals);
      } else {
        unavailable.push(localInterval(
          date,
          timezone,
          override.start,
          override.end,
        ));
      }
    }
  }

  for (const [dateText, intervals] of availableByDate) {
    const day = localInterval(Temporal.PlainDate.from(dateText), timezone);
    open = [...subtract(open, [day]), ...intervals];
  }

  return normalize(subtract(clamp(open, window), clamp(unavailable, window)));
}

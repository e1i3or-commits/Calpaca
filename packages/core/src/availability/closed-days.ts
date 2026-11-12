import { Temporal } from "@js-temporal/polyfill";
import type { ScheduleOverride } from "./overrides.js";

/**
 * Days the whole workspace is closed: the US holidays it observes plus its
 * own dates (a conference, an offsite). They apply to every host as a
 * full-day unavailable exception, in that host's own timezone.
 */

export const US_HOLIDAYS = [
  { key: "new_years_day", name: "New Year's Day" },
  { key: "mlk_day", name: "Martin Luther King Jr. Day" },
  { key: "presidents_day", name: "Presidents' Day" },
  { key: "memorial_day", name: "Memorial Day" },
  { key: "juneteenth", name: "Juneteenth" },
  { key: "independence_day", name: "Independence Day" },
  { key: "labor_day", name: "Labor Day" },
  { key: "columbus_day", name: "Columbus Day" },
  { key: "veterans_day", name: "Veterans Day" },
  { key: "thanksgiving", name: "Thanksgiving" },
  { key: "day_after_thanksgiving", name: "Day after Thanksgiving" },
  { key: "christmas_day", name: "Christmas Day" },
] as const;

export type UsHolidayKey = (typeof US_HOLIDAYS)[number]["key"];

/** What a workspace observes until an admin changes it. */
export const DEFAULT_US_HOLIDAYS: readonly UsHolidayKey[] = [
  "new_years_day",
  "memorial_day",
  "juneteenth",
  "independence_day",
  "labor_day",
  "thanksgiving",
  "day_after_thanksgiving",
  "christmas_day",
];

export function isUsHolidayKey(value: string): value is UsHolidayKey {
  return US_HOLIDAYS.some((holiday) => holiday.key === value);
}

/** A workspace's own closed range, both ends inclusive, `YYYY-MM-DD`. */
export interface ClosedRange {
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface ClosedDay {
  readonly date: string;
  readonly name: string;
}

const MONDAY = 1;
const THURSDAY = 4;

/** The `n`th `dayOfWeek` (ISO, Monday 1) of a month; n = -1 is the last one. */
function nthWeekday(year: number, month: number, dayOfWeek: number, n: number): Temporal.PlainDate {
  if (n > 0) {
    const first = Temporal.PlainDate.from({ year, month, day: 1 });
    const offset = (dayOfWeek - first.dayOfWeek + 7) % 7;
    return first.add({ days: offset + (n - 1) * 7 });
  }
  const last = Temporal.PlainDate.from({ year, month, day: 1 }).add({ months: 1 }).subtract({ days: 1 });
  return last.subtract({ days: (last.dayOfWeek - dayOfWeek + 7) % 7 });
}

/** A fixed-date holiday on a weekend is observed on the Friday before or the Monday after. */
function observed(date: Temporal.PlainDate): Temporal.PlainDate {
  if (date.dayOfWeek === 6) return date.subtract({ days: 1 });
  if (date.dayOfWeek === 7) return date.add({ days: 1 });
  return date;
}

function fixed(year: number, month: number, day: number): Temporal.PlainDate {
  return observed(Temporal.PlainDate.from({ year, month, day }));
}

function holidayDate(key: UsHolidayKey, year: number): Temporal.PlainDate {
  switch (key) {
    case "new_years_day": return fixed(year, 1, 1);
    case "mlk_day": return nthWeekday(year, 1, MONDAY, 3);
    case "presidents_day": return nthWeekday(year, 2, MONDAY, 3);
    case "memorial_day": return nthWeekday(year, 5, MONDAY, -1);
    case "juneteenth": return fixed(year, 6, 19);
    case "independence_day": return fixed(year, 7, 4);
    case "labor_day": return nthWeekday(year, 9, MONDAY, 1);
    case "columbus_day": return nthWeekday(year, 10, MONDAY, 2);
    case "veterans_day": return fixed(year, 11, 11);
    case "thanksgiving": return nthWeekday(year, 11, THURSDAY, 4);
    case "day_after_thanksgiving": return nthWeekday(year, 11, THURSDAY, 4).add({ days: 1 });
    case "christmas_day": return fixed(year, 12, 25);
  }
}

/**
 * Every closed day from `fromDate` to `toDate` inclusive, sorted by date. A
 * holiday observed in the neighbouring year (New Year's Day on a Saturday is
 * observed on December 31) lands on its observed date.
 */
export function closedDaysBetween(
  fromDate: string,
  toDate: string,
  holidays: readonly UsHolidayKey[],
  ranges: readonly ClosedRange[],
): ClosedDay[] {
  const from = Temporal.PlainDate.from(fromDate);
  const to = Temporal.PlainDate.from(toDate);
  const inRange = (date: Temporal.PlainDate) =>
    Temporal.PlainDate.compare(date, from) >= 0 && Temporal.PlainDate.compare(date, to) <= 0;
  const out: ClosedDay[] = [];
  for (let year = from.year - 1; year <= to.year + 1; year += 1) {
    for (const key of holidays) {
      const date = holidayDate(key, year);
      if (inRange(date)) out.push({ date: date.toString(), name: US_HOLIDAYS.find((h) => h.key === key)!.name });
    }
  }
  for (const range of ranges) {
    let date = Temporal.PlainDate.from(range.startDate);
    const end = Temporal.PlainDate.from(range.endDate);
    if (Temporal.PlainDate.compare(date, from) < 0) date = from;
    for (; Temporal.PlainDate.compare(date, end) <= 0 && inRange(date); date = date.add({ days: 1 })) {
      out.push({ date: date.toString(), name: range.name });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Closed days as full-day unavailable exceptions, to append to each host's own. */
export function closedDayOverrides(days: readonly ClosedDay[]): ScheduleOverride[] {
  return days.map((day) => ({ startDate: day.date, endDate: day.date, kind: "unavailable" }));
}

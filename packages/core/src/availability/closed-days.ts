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
  { key: "easter", name: "Easter" },
  { key: "orthodox_easter", name: "Orthodox Easter" },
  { key: "memorial_day", name: "Memorial Day" },
  { key: "juneteenth", name: "Juneteenth" },
  { key: "independence_day", name: "Independence Day" },
  { key: "labor_day", name: "Labor Day" },
  { key: "columbus_day", name: "Columbus Day" },
  { key: "veterans_day", name: "Veterans Day" },
  { key: "thanksgiving", name: "Thanksgiving" },
  { key: "day_after_thanksgiving", name: "Day after Thanksgiving" },
  { key: "christmas_eve", name: "Christmas Eve" },
  { key: "christmas_day", name: "Christmas Day" },
  { key: "new_years_eve", name: "New Year's Eve" },
] as const;

export type UsHolidayKey = (typeof US_HOLIDAYS)[number]["key"];

/**
 * What a workspace observes until an admin changes it: every holiday listed,
 * which is the TourScale handbook's list (all US federal holidays plus both
 * Easters, Christmas Eve, the day after Thanksgiving and New Year's Eve).
 */
export const DEFAULT_US_HOLIDAYS: readonly UsHolidayKey[] = US_HOLIDAYS.map((holiday) => holiday.key);

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

/** An eve on a weekend is observed on the Friday before, so it never lands on the holiday it precedes. */
function eve(year: number, month: number, day: number): Temporal.PlainDate {
  const date = Temporal.PlainDate.from({ year, month, day });
  return date.dayOfWeek >= 6 ? date.subtract({ days: date.dayOfWeek - 5 }) : date;
}

/** Western (Gregorian) Easter Sunday: the anonymous Gregorian computus. */
export function easterSunday(year: number): Temporal.PlainDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Temporal.PlainDate.from({ year, month: Math.floor(n / 31), day: (n % 31) + 1 });
}

/** Orthodox Easter Sunday: Meeus' Julian computus, moved to the Gregorian calendar (13 days, 1900 to 2099). */
export function orthodoxEasterSunday(year: number): Temporal.PlainDate {
  const d = (19 * (year % 19) + 15) % 30;
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7;
  const n = d + e + 114;
  return Temporal.PlainDate.from({ year, month: Math.floor(n / 31), day: (n % 31) + 1 }).add({ days: 13 });
}

function holidayDate(key: UsHolidayKey, year: number): Temporal.PlainDate {
  switch (key) {
    case "new_years_day": return fixed(year, 1, 1);
    case "mlk_day": return nthWeekday(year, 1, MONDAY, 3);
    case "presidents_day": return nthWeekday(year, 2, MONDAY, 3);
    case "easter": return easterSunday(year);
    case "orthodox_easter": return orthodoxEasterSunday(year);
    case "memorial_day": return nthWeekday(year, 5, MONDAY, -1);
    case "juneteenth": return fixed(year, 6, 19);
    case "independence_day": return fixed(year, 7, 4);
    case "labor_day": return nthWeekday(year, 9, MONDAY, 1);
    case "columbus_day": return nthWeekday(year, 10, MONDAY, 2);
    case "veterans_day": return fixed(year, 11, 11);
    case "thanksgiving": return nthWeekday(year, 11, THURSDAY, 4);
    case "day_after_thanksgiving": return nthWeekday(year, 11, THURSDAY, 4).add({ days: 1 });
    case "christmas_eve": return eve(year, 12, 24);
    case "christmas_day": return fixed(year, 12, 25);
    case "new_years_eve": return eve(year, 12, 31);
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

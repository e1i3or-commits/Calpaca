import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  closedDayOverrides,
  closedDaysBetween,
  DEFAULT_US_HOLIDAYS,
  US_HOLIDAYS,
} from "../../src/availability/closed-days.js";
import { effectiveOpenIntervals } from "../../src/availability/overrides.js";

const allKeys = US_HOLIDAYS.map((holiday) => holiday.key);

describe("closedDaysBetween", () => {
  test("lists every US federal holiday of 2026 on its observed date", () => {
    const days = closedDaysBetween("2026-01-01", "2026-12-31", allKeys, []);
    expect(days.map((day) => `${day.date} ${day.name}`)).toEqual([
      "2026-01-01 New Year's Day",
      "2026-01-19 Martin Luther King Jr. Day",
      "2026-02-16 Presidents' Day",
      "2026-05-25 Memorial Day",
      "2026-06-19 Juneteenth",
      // July 4, 2026 is a Saturday.
      "2026-07-03 Independence Day",
      "2026-09-07 Labor Day",
      "2026-10-12 Columbus Day",
      "2026-11-11 Veterans Day",
      "2026-11-26 Thanksgiving",
      "2026-11-27 Day after Thanksgiving",
      "2026-12-25 Christmas Day",
    ]);
  });

  test("the default set is the common eight", () => {
    const days = closedDaysBetween("2027-01-01", "2027-12-31", DEFAULT_US_HOLIDAYS, []);
    expect(days.map((day) => day.date)).toEqual([
      "2027-01-01",
      "2027-05-31",
      // June 19, 2027 is a Saturday.
      "2027-06-18",
      "2027-07-05",
      "2027-09-06",
      "2027-11-25",
      "2027-11-26",
      // December 25, 2027 is a Saturday.
      "2027-12-24",
      // January 1, 2028 is a Saturday.
      "2027-12-31",
    ]);
  });

  test("New Year's Day on a Saturday closes December 31 of the year before", () => {
    // January 1, 2028 is a Saturday.
    const days = closedDaysBetween("2027-12-30", "2028-01-03", ["new_years_day"], []);
    expect(days).toEqual([{ date: "2027-12-31", name: "New Year's Day" }]);
  });

  test("a workspace range closes each of its days, clipped to the query", () => {
    const conference = { name: "TourScale Conference", startDate: "2027-02-01", endDate: "2027-02-04" };
    expect(closedDaysBetween("2027-02-02", "2027-02-10", [], [conference]).map((day) => day.date)).toEqual([
      "2027-02-02",
      "2027-02-03",
      "2027-02-04",
    ]);
  });

  test("no holidays and no ranges closes nothing", () => {
    expect(closedDaysBetween("2026-01-01", "2026-12-31", [], [])).toEqual([]);
  });
});

describe("closedDayOverrides", () => {
  test("closes the whole local day in the host's timezone", () => {
    const weekdays = [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" }));
    const window = {
      start: Temporal.Instant.from("2026-11-23T00:00:00Z"),
      end: Temporal.Instant.from("2026-11-30T00:00:00Z"),
    };
    const overrides = closedDayOverrides(closedDaysBetween("2026-11-23", "2026-11-29", DEFAULT_US_HOLIDAYS, []));
    const open = effectiveOpenIntervals(weekdays, overrides, "America/Bogota", window);
    expect(open.map((interval) => interval.start.toZonedDateTimeISO("America/Bogota").toPlainDate().toString())).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
    ]);
  });
});

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
  test("lists every holiday of 2026 on its observed date", () => {
    const days = closedDaysBetween("2026-01-01", "2026-12-31", allKeys, []);
    expect(days.map((day) => `${day.date} ${day.name}`)).toEqual([
      "2026-01-01 New Year's Day",
      "2026-01-19 Martin Luther King Jr. Day",
      "2026-02-16 Presidents' Day",
      "2026-04-05 Easter",
      "2026-04-12 Orthodox Easter",
      "2026-05-25 Memorial Day",
      "2026-06-19 Juneteenth",
      // July 4, 2026 is a Saturday.
      "2026-07-03 Independence Day",
      "2026-09-07 Labor Day",
      "2026-10-12 Columbus Day",
      "2026-11-11 Veterans Day",
      "2026-11-26 Thanksgiving",
      "2026-11-27 Day after Thanksgiving",
      "2026-12-24 Christmas Eve",
      "2026-12-25 Christmas Day",
      "2026-12-31 New Year's Eve",
    ]);
  });

  test("the default set is the handbook's: every holiday listed", () => {
    expect([...DEFAULT_US_HOLIDAYS]).toEqual(allKeys);
  });

  test("Easter and Orthodox Easter fall on their Sundays", () => {
    const sundays = (key: "easter" | "orthodox_easter") =>
      closedDaysBetween("2025-01-01", "2029-12-31", [key], []).map((day) => day.date);
    expect(sundays("easter")).toEqual(["2025-04-20", "2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01"]);
    expect(sundays("orthodox_easter")).toEqual(["2025-04-20", "2026-04-12", "2027-05-02", "2028-04-16", "2029-04-08"]);
  });

  test("an eve on a weekend is observed on the Friday before", () => {
    // December 24, 2022 is a Saturday; December 31, 2023 is a Sunday.
    expect(closedDaysBetween("2022-12-01", "2022-12-31", ["christmas_eve"], [])).toEqual([{ date: "2022-12-23", name: "Christmas Eve" }]);
    expect(closedDaysBetween("2023-12-01", "2023-12-31", ["new_years_eve"], [])).toEqual([{ date: "2023-12-29", name: "New Year's Eve" }]);
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

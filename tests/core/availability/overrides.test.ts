import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  effectiveOpenIntervals,
  forwardingIntervals,
  type ScheduleOverride,
} from "../../../src/core/availability/overrides";

const instant = (value: string) => Temporal.Instant.from(value);
const window = {
  start: instant("2026-07-20T00:00:00Z"),
  end: instant("2026-07-28T00:00:00Z"),
};
const weekdays = [1, 2, 3, 4, 5].map((dow) => ({
  dow,
  start: "09:00",
  end: "17:00",
}));

describe("effectiveOpenIntervals", () => {
  test("full-day time off removes recurring hours across a date range", () => {
    const result = effectiveOpenIntervals(
      weekdays,
      [{
        startDate: "2026-07-21",
        endDate: "2026-07-22",
        kind: "unavailable",
      }],
      "UTC",
      window,
    );
    expect(result.map((interval) => interval.start.toString())).toEqual([
      "2026-07-20T09:00:00Z",
      "2026-07-23T09:00:00Z",
      "2026-07-24T09:00:00Z",
      "2026-07-27T09:00:00Z",
    ]);
  });

  test("alternate hours replace recurring hours for the local date", () => {
    const result = effectiveOpenIntervals(
      weekdays,
      [{
        startDate: "2026-07-21",
        endDate: "2026-07-21",
        kind: "available",
        start: "12:00",
        end: "15:00",
      }],
      "America/New_York",
      window,
    );
    const tuesday = result.find((interval) =>
      interval.start.toZonedDateTimeISO("America/New_York").day === 21
    );
    expect(tuesday?.start.toString()).toBe("2026-07-21T16:00:00Z");
    expect(tuesday?.end.toString()).toBe("2026-07-21T19:00:00Z");
  });

  test("partial unavailable time is subtracted from a working day", () => {
    const result = effectiveOpenIntervals(
      weekdays,
      [{
        startDate: "2026-07-20",
        endDate: "2026-07-20",
        kind: "unavailable",
        start: "12:00",
        end: "13:00",
      }],
      "UTC",
      window,
    ).filter((interval) => interval.start.toZonedDateTimeISO("UTC").day === 20);
    expect(result.map((interval) => [
      interval.start.toString(),
      interval.end.toString(),
    ])).toEqual([
      ["2026-07-20T09:00:00Z", "2026-07-20T12:00:00Z"],
      ["2026-07-20T13:00:00Z", "2026-07-20T17:00:00Z"],
    ]);
  });

  test("full-day OOO follows local DST boundaries", () => {
    const result = effectiveOpenIntervals(
      [{ dow: 7, start: "00:00", end: "23:59" }],
      [{
        startDate: "2026-03-08",
        endDate: "2026-03-08",
        kind: "unavailable",
      }],
      "America/New_York",
      {
        start: instant("2026-03-08T00:00:00Z"),
        end: instant("2026-03-09T12:00:00Z"),
      },
    );
    expect(result).toEqual([]);
  });
});

describe("forwardingIntervals", () => {
  test("returns only windows assigned to the requested teammate", () => {
    const overrides: ScheduleOverride[] = [{
      startDate: "2026-07-21",
      endDate: "2026-07-22",
      kind: "unavailable",
      forwardToUserId: "teammate",
    }];
    expect(forwardingIntervals(overrides, "UTC", "teammate", window).map(
      (interval) => [interval.start.toString(), interval.end.toString()],
    )).toEqual([[
      "2026-07-21T00:00:00Z",
      "2026-07-23T00:00:00Z",
    ]]);
    expect(forwardingIntervals(overrides, "UTC", "someone-else", window)).toEqual([]);
  });
});

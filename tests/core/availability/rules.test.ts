import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { expandRules, type WeeklyRule } from "../../../src/core/availability/rules";
import type { Interval } from "../../../src/core/availability/intervals";
import { dstFixtures, phoenixNoDst, sydneySpringForward, usFallBack, usSpringForward } from "../../helpers/fixtures";

function at(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

function iv(startIso: string, endIso: string): Interval {
  return { start: at(startIso), end: at(endIso) };
}

function zonedInstant(localDateTime: string, timeZone: string, disambiguation: Temporal.ToInstantOptions["disambiguation"] = "compatible"): Temporal.Instant {
  return Temporal.PlainDateTime.from(localDateTime.replace(" ", "T")).toZonedDateTime(timeZone, { disambiguation }).toInstant();
}

describe("expandRules", () => {
  test("empty rules yields empty output", () => {
    expect(expandRules([], "UTC", iv("2027-01-04T00:00Z", "2027-01-05T00:00Z"))).toEqual([]);
  });

  test("expands a single weekday rule in UTC", () => {
    const rules: WeeklyRule[] = [{ dow: 1, start: "09:00", end: "17:00" }]; // Monday 2027-01-04
    const window = iv("2027-01-01T00:00Z", "2027-01-08T00:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([iv("2027-01-04T09:00Z", "2027-01-04T17:00Z")]);
  });

  test("expands a rule in a non-UTC zone with a fixed offset (no DST in range)", () => {
    // January in America/New_York is EST, UTC-5, no transition nearby.
    const rules: WeeklyRule[] = [{ dow: 1, start: "09:00", end: "17:00" }];
    const window = iv("2027-01-01T00:00Z", "2027-01-08T00:00Z");
    expect(expandRules(rules, "America/New_York", window)).toEqual([iv("2027-01-04T14:00Z", "2027-01-04T22:00Z")]);
  });

  test("only expands on the matching day of week", () => {
    const rules: WeeklyRule[] = [{ dow: 2, start: "09:00", end: "17:00" }]; // Tuesday 2027-01-05
    const window = iv("2027-01-01T00:00Z", "2027-01-08T00:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([iv("2027-01-05T09:00Z", "2027-01-05T17:00Z")]);
  });

  test("expands multiple rules across multiple weeks in the window", () => {
    const rules: WeeklyRule[] = [{ dow: 1, start: "09:00", end: "17:00" }];
    const window = iv("2027-01-01T00:00Z", "2027-01-15T00:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([
      iv("2027-01-04T09:00Z", "2027-01-04T17:00Z"),
      iv("2027-01-11T09:00Z", "2027-01-11T17:00Z"),
    ]);
  });

  test("a rule crossing midnight (start > end) spans into the next day", () => {
    const rules: WeeklyRule[] = [{ dow: 1, start: "22:00", end: "02:00" }]; // Monday 2027-01-04
    const window = iv("2027-01-01T00:00Z", "2027-01-08T00:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([iv("2027-01-04T22:00Z", "2027-01-05T02:00Z")]);
  });

  test("a window starting mid-way through a midnight-crossing rule is clamped, not dropped", () => {
    const rules: WeeklyRule[] = [{ dow: 1, start: "22:00", end: "02:00" }]; // Monday 2027-01-04
    const window = iv("2027-01-04T23:00Z", "2027-01-08T00:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([iv("2027-01-04T23:00Z", "2027-01-05T02:00Z")]);
  });

  test("a window that starts mid-rule is clamped to the window", () => {
    const rules: WeeklyRule[] = [{ dow: 1, start: "09:00", end: "17:00" }]; // Monday 2027-01-04
    const window = iv("2027-01-04T12:00Z", "2027-01-04T20:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([iv("2027-01-04T12:00Z", "2027-01-04T17:00Z")]);
  });

  test("a window that ends mid-rule is clamped to the window", () => {
    const rules: WeeklyRule[] = [{ dow: 1, start: "09:00", end: "17:00" }]; // Monday 2027-01-04
    const window = iv("2027-01-04T00:00Z", "2027-01-04T12:00Z");
    expect(expandRules(rules, "UTC", window)).toEqual([iv("2027-01-04T09:00Z", "2027-01-04T12:00Z")]);
  });

  describe("DST correctness", () => {
    // Every DST fixture's transition date is a Sunday (dow 7). A rule that
    // brackets the transition (00:00-08:00 local) is nominally 8 wall-clock
    // hours; the actual elapsed UTC duration reveals whether the gap/fold
    // was handled correctly.
    const expectedHours: Record<string, number> = {
      "US spring-forward": 7,
      "US fall-back": 9,
      "Sydney spring-forward": 7,
      "Phoenix no-DST": 8,
    };

    for (const fixture of dstFixtures) {
      const expected = expectedHours[fixture.name]!;
      test(`${fixture.name}: 00:00-08:00 local yields ${expected}h elapsed UTC`, () => {
        const localDate = fixture.localTransition.split(" ")[0]!;
        const rules: WeeklyRule[] = [{ dow: 7, start: "00:00", end: "08:00" }];
        const dayStart = zonedInstant(`${localDate} 00:00`, fixture.timeZone);
        const nextDayStart = zonedInstant(`${localDate} 00:00`, fixture.timeZone).add({ hours: 48 });
        const window = { start: dayStart, end: nextDayStart };

        const result = expandRules(rules, fixture.timeZone, window);
        expect(result).toHaveLength(1);
        const duration = result[0]!.start.until(result[0]!.end).total({ unit: "hours" });
        expect(duration).toBe(expected);
      });
    }

    test("US spring-forward: start time inside the gap resolves with 'compatible' disambiguation", () => {
      const rules: WeeklyRule[] = [{ dow: 7, start: "02:30", end: "04:00" }];
      const window = iv("2027-03-14T00:00Z", "2027-03-15T00:00Z");
      const result = expandRules(rules, usSpringForward.timeZone, window);
      const expectedStart = zonedInstant("2027-03-14 02:30", usSpringForward.timeZone, "compatible");
      const expectedEnd = zonedInstant("2027-03-14 04:00", usSpringForward.timeZone, "compatible");
      expect(result).toEqual([{ start: expectedStart, end: expectedEnd }]);
    });

    test("US fall-back: the repeated local hour resolves with 'compatible' disambiguation", () => {
      const rules: WeeklyRule[] = [{ dow: 7, start: "01:00", end: "01:45" }];
      const window = iv("2027-11-07T00:00Z", "2027-11-08T00:00Z");
      const result = expandRules(rules, usFallBack.timeZone, window);
      const expectedStart = zonedInstant("2027-11-07 01:00", usFallBack.timeZone, "compatible");
      const expectedEnd = zonedInstant("2027-11-07 01:45", usFallBack.timeZone, "compatible");
      expect(result).toEqual([{ start: expectedStart, end: expectedEnd }]);
    });

    test("Sydney spring-forward matches the US spring-forward gap behavior", () => {
      const rules: WeeklyRule[] = [{ dow: 7, start: "00:00", end: "08:00" }];
      const window = iv("2027-10-02T12:00Z", "2027-10-04T12:00Z");
      const result = expandRules(rules, sydneySpringForward.timeZone, window);
      expect(result).toHaveLength(1);
      const hours = result[0]!.start.until(result[0]!.end).total({ unit: "hours" });
      expect(hours).toBe(7);
    });

    test("Phoenix never observes DST: duration stays 8 hours across the US transition date", () => {
      const rules: WeeklyRule[] = [{ dow: 7, start: "00:00", end: "08:00" }];
      const window = iv("2027-03-13T12:00Z", "2027-03-15T12:00Z");
      const result = expandRules(rules, phoenixNoDst.timeZone, window);
      expect(result).toHaveLength(1);
      const hours = result[0]!.start.until(result[0]!.end).total({ unit: "hours" });
      expect(hours).toBe(8);
    });
  });
});

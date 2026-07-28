import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  MAX_SUGGESTION_RANGE_DAYS,
  suggestOpenSlots,
  suggestionWindow,
  type SuggestionConstraints,
  type SuggestionSchedule,
} from "../../../src/core/availability/suggest";
import type { Interval } from "../../../src/core/availability/intervals";

/** Mon-Fri 09:00-17:00 in New York. */
const SCHEDULE: SuggestionSchedule = {
  timezone: "America/New_York",
  rules: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" })),
};

function interval(start: string, end: string): Interval {
  return { start: Temporal.Instant.from(start), end: Temporal.Instant.from(end) };
}

function baseConstraints(over: Partial<SuggestionConstraints> = {}): SuggestionConstraints {
  const requested = suggestionWindow({
    timezone: "America/New_York",
    startDate: "2026-07-29",
    endDate: "2026-07-31",
    dailyStart: "09:00",
    dailyEnd: "17:00",
  });
  return {
    window: requested.window,
    dailyWindows: requested.dailyWindows,
    durationMinutes: 30,
    count: 3,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minimumNoticeMin: 0,
    slotIncrementMin: 15,
    slotTimezone: "America/New_York",
    ...over,
  };
}

// Well before the window so minimum-notice rules do not accidentally bite.
const NOW = Temporal.Instant.from("2026-07-27T12:00:00Z");

describe("suggestionWindow", () => {
  test("expands one interval per day, not one interval across the range", () => {
    const { dailyWindows } = suggestionWindow({
      timezone: "America/New_York",
      startDate: "2026-07-29",
      endDate: "2026-07-31",
      dailyStart: "09:00",
      dailyEnd: "17:00",
    });
    expect(dailyWindows).toHaveLength(3);
    for (const day of dailyWindows) {
      expect(day.start.until(day.end).total({ unit: "hours" })).toBeCloseTo(8, 6);
    }
  });

  test("the outer window spans the first start to the last end", () => {
    const { window, dailyWindows } = suggestionWindow({
      timezone: "America/New_York",
      startDate: "2026-07-29",
      endDate: "2026-07-31",
      dailyStart: "09:00",
      dailyEnd: "17:00",
    });
    expect(window.start.equals(dailyWindows[0]!.start)).toBe(true);
    expect(window.end.equals(dailyWindows.at(-1)!.end)).toBe(true);
  });

  test("a single-day range is allowed", () => {
    const { dailyWindows } = suggestionWindow({
      timezone: "UTC",
      startDate: "2026-07-29",
      endDate: "2026-07-29",
      dailyStart: "09:00",
      dailyEnd: "10:00",
    });
    expect(dailyWindows).toHaveLength(1);
  });

  test("rejects a reversed date range", () => {
    expect(() => suggestionWindow({
      timezone: "UTC",
      startDate: "2026-07-31",
      endDate: "2026-07-29",
      dailyStart: "09:00",
      dailyEnd: "17:00",
    })).toThrow(RangeError);
  });

  test("rejects a reversed or empty daily window", () => {
    const bounds = { timezone: "UTC", startDate: "2026-07-29", endDate: "2026-07-30" };
    expect(() => suggestionWindow({ ...bounds, dailyStart: "17:00", dailyEnd: "09:00" }))
      .toThrow(RangeError);
    expect(() => suggestionWindow({ ...bounds, dailyStart: "09:00", dailyEnd: "09:00" }))
      .toThrow(RangeError);
  });

  test(`rejects a range longer than ${MAX_SUGGESTION_RANGE_DAYS} days`, () => {
    expect(() => suggestionWindow({
      timezone: "UTC",
      startDate: "2026-07-01",
      endDate: "2026-08-15",
      dailyStart: "09:00",
      dailyEnd: "17:00",
    })).toThrow(RangeError);
  });

  // A fixed offset would make the daily window drift by an hour mid-range.
  test("each day keeps its own wall-clock window across a DST transition", () => {
    const { dailyWindows } = suggestionWindow({
      timezone: "America/New_York",
      startDate: "2026-03-07",
      endDate: "2026-03-09",
      dailyStart: "09:00",
      dailyEnd: "17:00",
    });
    for (const day of dailyWindows) {
      const local = day.start.toZonedDateTimeISO("America/New_York");
      expect(local.hour).toBe(9);
    }
    // Sat->Sun crosses the spring-forward, so those 09:00s are only 23 UTC
    // hours apart; Sun->Mon is a normal 24. A fixed offset would give 24/24
    // and quietly place the Sunday window an hour off.
    const satToSun = dailyWindows[0]!.start.until(dailyWindows[1]!.start)
      .total({ unit: "hours" });
    const sunToMon = dailyWindows[1]!.start.until(dailyWindows[2]!.start)
      .total({ unit: "hours" });
    expect(satToSun).toBe(23);
    expect(sunToMon).toBe(24);
  });
});

describe("suggestOpenSlots", () => {
  test("returns at most `count` slots, best first", () => {
    const slots = suggestOpenSlots(SCHEDULE, [], baseConstraints({ count: 3 }), NOW);
    expect(slots).toHaveLength(3);
    for (let i = 1; i < slots.length; i += 1) {
      expect(Temporal.Instant.compare(slots[i - 1]!.start, slots[i]!.start)).not.toBe(0);
    }
  });

  test("count of zero asks for nothing and does no work", () => {
    expect(suggestOpenSlots(SCHEDULE, [], baseConstraints({ count: 0 }), NOW)).toEqual([]);
  });

  test("every suggestion falls inside working hours", () => {
    const slots = suggestOpenSlots(SCHEDULE, [], baseConstraints({ count: 10 }), NOW);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const local = slot.start.toZonedDateTimeISO("America/New_York");
      expect(local.hour).toBeGreaterThanOrEqual(9);
      expect(local.dayOfWeek).toBeLessThanOrEqual(5);
      expect(slot.end.toZonedDateTimeISO("America/New_York").hour).toBeLessThanOrEqual(17);
    }
  });

  // The whole point of the feature: never offer a time already committed.
  test("busy time is never suggested", () => {
    const busy = [interval("2026-07-29T13:00:00Z", "2026-07-29T21:00:00Z")]; // all Wed
    const slots = suggestOpenSlots(SCHEDULE, busy, baseConstraints({ count: 20 }), NOW);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const overlapsBusy = Temporal.Instant.compare(slot.start, busy[0]!.end) < 0
        && Temporal.Instant.compare(busy[0]!.start, slot.end) < 0;
      expect(overlapsBusy).toBe(false);
    }
  });

  test("a fully booked range yields no suggestions rather than bad ones", () => {
    const busy = [interval("2026-07-29T00:00:00Z", "2026-08-01T00:00:00Z")];
    expect(suggestOpenSlots(SCHEDULE, busy, baseConstraints({ count: 5 }), NOW)).toEqual([]);
  });

  test("buffers keep a suggestion away from an adjacent commitment", () => {
    const busy = [interval("2026-07-29T14:00:00Z", "2026-07-29T15:00:00Z")];
    const withBuffer = suggestOpenSlots(
      SCHEDULE,
      busy,
      baseConstraints({ count: 40, bufferBeforeMin: 30, bufferAfterMin: 30 }),
      NOW,
    );
    for (const slot of withBuffer) {
      const gapBefore = slot.end.until(busy[0]!.start).total({ unit: "minutes" });
      const gapAfter = busy[0]!.end.until(slot.start).total({ unit: "minutes" });
      // Either it ends >=30min before the meeting or starts >=30min after it.
      expect(gapBefore >= 30 || gapAfter >= 30).toBe(true);
    }
  });

  test("minimum notice excludes slots that are too soon", () => {
    const near = Temporal.Instant.from("2026-07-29T13:00:00Z"); // 9am Wed local
    const slots = suggestOpenSlots(
      SCHEDULE,
      [],
      baseConstraints({ count: 40, minimumNoticeMin: 24 * 60 }),
      near,
    );
    const threshold = near.add({ minutes: 24 * 60 });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(Temporal.Instant.compare(slot.start, threshold)).toBeGreaterThanOrEqual(0);
    }
  });

  test("the requested duration is what gets offered", () => {
    for (const durationMinutes of [15, 45, 60]) {
      const slots = suggestOpenSlots(
        SCHEDULE,
        [],
        baseConstraints({ durationMinutes, count: 4 }),
        NOW,
      );
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.start.until(slot.end).total({ unit: "minutes" })).toBe(durationMinutes);
      }
    }
  });

  test("a narrower daily window is respected", () => {
    const requested = suggestionWindow({
      timezone: "America/New_York",
      startDate: "2026-07-29",
      endDate: "2026-07-31",
      dailyStart: "14:00",
      dailyEnd: "16:00",
    });
    const slots = suggestOpenSlots(SCHEDULE, [], baseConstraints({
      window: requested.window,
      dailyWindows: requested.dailyWindows,
      count: 20,
    }), NOW);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const local = slot.start.toZonedDateTimeISO("America/New_York");
      expect(local.hour).toBeGreaterThanOrEqual(14);
      expect(slot.end.toZonedDateTimeISO("America/New_York").hour).toBeLessThanOrEqual(16);
    }
  });

  // An empty list must mean "any time of day", not "no time of day" — the
  // difference between working and returning nothing.
  test("no daily windows means the whole schedule is fair game", () => {
    const slots = suggestOpenSlots(SCHEDULE, [], baseConstraints({
      dailyWindows: [],
      count: 5,
    }), NOW);
    expect(slots.length).toBeGreaterThan(0);
  });

  test("a schedule with no rules yields nothing", () => {
    const slots = suggestOpenSlots(
      { timezone: "America/New_York", rules: [] },
      [],
      baseConstraints({ count: 5 }),
      NOW,
    );
    expect(slots).toEqual([]);
  });

  test("is deterministic for identical input", () => {
    const args = () => [SCHEDULE, [], baseConstraints({ count: 5 }), NOW] as const;
    const first = suggestOpenSlots(...args());
    const second = suggestOpenSlots(...args());
    expect(first.map((s) => s.start.toString())).toEqual(second.map((s) => s.start.toString()));
  });
});

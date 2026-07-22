import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  adjacencyBonus,
  focusBlockPenalty,
  fragmentationPenalty,
  scoreSlots,
  timeOfDay,
  type ScoringContext,
} from "../../../src/core/availability/scoring";
import type { Interval } from "../../../src/core/availability/intervals";

function at(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

function iv(startIso: string, endIso: string): Interval {
  return { start: at(startIso), end: at(endIso) };
}

describe("fragmentationPenalty", () => {
  const block = iv("2027-01-04T09:00Z", "2027-01-04T12:00Z");

  test("consuming the leading edge of a large block scores no penalty", () => {
    expect(fragmentationPenalty(iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), [block])).toBe(0);
  });

  test("consuming the trailing edge of a large block scores no penalty", () => {
    expect(fragmentationPenalty(iv("2027-01-04T11:30Z", "2027-01-04T12:00Z"), [block])).toBe(0);
  });

  test("a slot in the middle of a large block that leaves leftovers on both sides is penalized", () => {
    expect(fragmentationPenalty(iv("2027-01-04T10:00Z", "2027-01-04T10:30Z"), [block])).toBe(1);
  });

  test("a slot with no containing open interval scores no penalty", () => {
    expect(fragmentationPenalty(iv("2027-01-04T20:00Z", "2027-01-04T20:30Z"), [block])).toBe(0);
  });
});

describe("adjacencyBonus", () => {
  test("a slot starting exactly where a busy interval ends gets a bonus", () => {
    const busy = [iv("2027-01-04T08:00Z", "2027-01-04T09:00Z")];
    expect(adjacencyBonus(iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), busy)).toBe(1);
  });

  test("a slot ending exactly where a busy interval starts gets a bonus", () => {
    const busy = [iv("2027-01-04T10:00Z", "2027-01-04T11:00Z")];
    expect(adjacencyBonus(iv("2027-01-04T09:30Z", "2027-01-04T10:00Z"), busy)).toBe(1);
  });

  test("a slot with a gap to the nearest busy interval gets no bonus", () => {
    const busy = [iv("2027-01-04T10:15Z", "2027-01-04T11:00Z")];
    expect(adjacencyBonus(iv("2027-01-04T09:30Z", "2027-01-04T10:00Z"), busy)).toBe(0);
  });
});

describe("timeOfDay", () => {
  test("a 9am slot in the host's zone scores the peak value", () => {
    expect(timeOfDay(iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), "UTC", 1)).toBeCloseTo(1, 5);
  });

  test("a 9pm slot scores lower than a 9am slot", () => {
    const morning = timeOfDay(iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), "UTC", 1);
    const evening = timeOfDay(iv("2027-01-04T21:00Z", "2027-01-04T21:30Z"), "UTC", 1);
    expect(evening).toBeLessThan(morning);
  });

  test("morningWeight of 0 zeroes out the signal regardless of hour", () => {
    expect(timeOfDay(iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), "UTC", 0)).toBe(0);
  });

  test("respects the host's own zone, not UTC", () => {
    // 09:00 in America/New_York (UTC-5 in January) is 14:00Z.
    const nyMorning = timeOfDay(iv("2027-01-04T14:00Z", "2027-01-04T14:30Z"), "America/New_York", 1);
    expect(nyMorning).toBeCloseTo(1, 5);
  });
});

describe("focusBlockPenalty", () => {
  // Monday 2027-01-04, focus block 13:00-15:00 local.
  const focusBlocks = [{ dow: 1, start: "13:00", end: "15:00" }];

  test("a slot outside any focus block scores no penalty", () => {
    expect(focusBlockPenalty(iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), focusBlocks, "UTC", 10)).toBe(0);
  });

  test("a slot fully inside a focus block scores full penalty when alternatives are plentiful", () => {
    expect(focusBlockPenalty(iv("2027-01-04T13:00Z", "2027-01-04T13:30Z"), focusBlocks, "UTC", 10)).toBe(1);
  });

  test("penalty relaxes proportionally when candidate count is below 5", () => {
    expect(focusBlockPenalty(iv("2027-01-04T13:00Z", "2027-01-04T13:30Z"), focusBlocks, "UTC", 2)).toBeCloseTo(0.4, 5);
  });

  test("a slot only partially overlapping the block is not considered inside it", () => {
    expect(focusBlockPenalty(iv("2027-01-04T14:45Z", "2027-01-04T15:15Z"), focusBlocks, "UTC", 10)).toBe(0);
  });
});

describe("scoreSlots", () => {
  const baseContext: ScoringContext = {
    busy: [],
    open: [iv("2027-01-04T09:00Z", "2027-01-04T17:00Z")],
    prefs: {},
    timezone: "UTC",
  };

  test("combined ordering: edge-consuming, adjacent, morning slot outranks a mid-block afternoon slot", () => {
    const context: ScoringContext = {
      ...baseContext,
      busy: [iv("2027-01-04T08:00Z", "2027-01-04T09:00Z")],
    };
    const slots = [
      iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"), // edge, adjacent to busy, morning
      iv("2027-01-04T13:00Z", "2027-01-04T13:30Z"), // mid-block, not adjacent, afternoon
    ];
    const ranked = scoreSlots(slots, context);
    expect(ranked[0]!.slot).toEqual(slots[0]!);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  test("determinism: scoring the same input twice yields identical output", () => {
    const slots = [
      iv("2027-01-04T09:00Z", "2027-01-04T09:30Z"),
      iv("2027-01-04T10:00Z", "2027-01-04T10:30Z"),
      iv("2027-01-04T13:00Z", "2027-01-04T13:30Z"),
    ];
    const first = scoreSlots(slots, baseContext);
    const second = scoreSlots(slots, baseContext);
    expect(second).toEqual(first);
  });

  test("ties break by earlier start", () => {
    // A full-day open block, no busy intervals: 05:00 and 13:00 are each 4
    // hours from the 9am peak, so timeOfDay is equal, and both are mid-block
    // (non-edge) so fragmentation is equal too. Scores tie; start order decides.
    const context: ScoringContext = {
      busy: [],
      open: [iv("2027-01-04T00:00Z", "2027-01-05T00:00Z")],
      prefs: {},
      timezone: "UTC",
    };
    const slots = [
      iv("2027-01-04T13:00Z", "2027-01-04T13:30Z"),
      iv("2027-01-04T05:00Z", "2027-01-04T05:30Z"),
    ];
    const ranked = scoreSlots(slots, context);
    expect(ranked[0]!.score).toBe(ranked[1]!.score);
    expect(ranked[0]!.slot).toEqual(slots[1]!);
    expect(ranked[1]!.slot).toEqual(slots[0]!);
  });

  test("focus-block relaxation changes ranking when few alternatives exist", () => {
    const context: ScoringContext = {
      ...baseContext,
      prefs: { focusBlocks: [{ dow: 1, start: "13:00", end: "15:00" }] },
    };
    const sparseSlots = [iv("2027-01-04T13:00Z", "2027-01-04T13:30Z")];
    const [relaxed] = scoreSlots(sparseSlots, context);

    const plentifulSlots = [
      iv("2027-01-04T13:00Z", "2027-01-04T13:30Z"),
      iv("2027-01-04T13:30Z", "2027-01-04T14:00Z"),
      iv("2027-01-04T14:00Z", "2027-01-04T14:30Z"),
      iv("2027-01-04T14:30Z", "2027-01-04T15:00Z"),
      iv("2027-01-04T15:00Z", "2027-01-04T15:30Z"),
    ];
    const full = scoreSlots(plentifulSlots, context).find((s) => s.slot.start.equals(at("2027-01-04T13:00Z")))!;

    expect(relaxed!.score).toBeGreaterThan(full.score);
  });
});

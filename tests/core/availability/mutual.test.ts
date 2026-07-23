import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { rankByMutualAvailability } from "../../../src/core/availability/mutual";

const instant = (value: string) => Temporal.Instant.from(value);
const slot = (start: string, end: string) => ({
  start: instant(start),
  end: instant(end),
});

describe("rankByMutualAvailability", () => {
  test("prioritizes mutual slots without removing conflicts", () => {
    const result = rankByMutualAvailability([
      { slot: slot("2026-08-01T10:00Z", "2026-08-01T10:30Z"), score: 10 },
      { slot: slot("2026-08-01T11:00Z", "2026-08-01T11:30Z"), score: 5 },
    ], [
      slot("2026-08-01T09:55Z", "2026-08-01T10:05Z"),
    ]);

    expect(result.map((item) => item.mutual)).toEqual([true, false]);
    expect(result.map((item) => item.slot.start.toString())).toEqual([
      "2026-08-01T11:00:00Z",
      "2026-08-01T10:00:00Z",
    ]);
  });

  test("treats touching interval boundaries as available", () => {
    const result = rankByMutualAvailability([
      { slot: slot("2026-08-01T10:00Z", "2026-08-01T10:30Z"), score: 1 },
    ], [
      slot("2026-08-01T09:30Z", "2026-08-01T10:00Z"),
    ]);
    expect(result[0]?.mutual).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { allowedDurations, isAllowedDuration } from "../../../src/core/booking/durations";

describe("selectable booking durations", () => {
  test("keeps legacy event types on their single configured duration", () => {
    expect(allowedDurations(30)).toEqual([30]);
    expect(isAllowedDuration(45, 30)).toBe(false);
  });

  test("accepts only the organizer's explicit choices", () => {
    expect(allowedDurations(30, [15, 30, 60])).toEqual([15, 30, 60]);
    expect(isAllowedDuration(60, 30, [15, 30, 60])).toBe(true);
    expect(isAllowedDuration(45, 30, [15, 30, 60])).toBe(false);
  });
});

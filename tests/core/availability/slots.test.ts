import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { generateSlots, type SlotConfig } from "../../../src/core/availability/slots";
import type { Interval } from "../../../src/core/availability/intervals";

function at(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

function iv(startIso: string, endIso: string): Interval {
  return { start: at(startIso), end: at(endIso) };
}

const baseConfig: SlotConfig = {
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 1,
  timezone: "UTC",
  slotIncrementMin: 15,
};

describe("generateSlots", () => {
  test("empty open intervals yield no slots", () => {
    expect(generateSlots([], baseConfig, at("2027-01-04T00:00Z"))).toEqual([]);
  });

  test("a slot fitting exactly inside an open interval is a candidate", () => {
    const open = [iv("2027-01-04T09:00Z", "2027-01-04T09:30Z")];
    const result = generateSlots(open, baseConfig, at("2027-01-04T00:00Z"));
    expect(result).toEqual([iv("2027-01-04T09:00Z", "2027-01-04T09:30Z")]);
  });

  test("buffer collisions at interval edges exclude slots whose padding overruns the interval", () => {
    const config: SlotConfig = { ...baseConfig, bufferBeforeMin: 10, bufferAfterMin: 10 };
    const open = [iv("2027-01-04T09:00Z", "2027-01-04T10:00Z")];
    const result = generateSlots(open, config, at("2027-01-04T00:00Z"));
    // 09:00 fails (padded start 08:50 < 09:00); 09:30 fails (padded end 10:10 > 10:00);
    // only 09:15 leaves room for both buffers within the interval.
    expect(result).toEqual([iv("2027-01-04T09:15Z", "2027-01-04T09:45Z")]);
  });

  test("notice boundary exactness: a slot at exactly now+notice is included, the prior one is not", () => {
    const config: SlotConfig = { ...baseConfig, minimumNoticeMin: 60 };
    const open = [iv("2027-01-04T09:00Z", "2027-01-04T09:46Z")];
    const now = at("2027-01-04T08:15Z"); // now + 60min == 09:15
    const result = generateSlots(open, config, now);
    expect(result).toEqual([iv("2027-01-04T09:15Z", "2027-01-04T09:45Z")]);
  });

  test("rolling window end mid-day excludes slots starting at or after it, keeps earlier same-day slots", () => {
    const config: SlotConfig = { ...baseConfig, durationMinutes: 30, slotIncrementMin: 30, rollingWindowDays: 1 };
    const now = at("2027-01-04T12:00:00Z"); // window end: 2027-01-05T12:00Z, mid-day
    const open = [iv("2027-01-05T11:00Z", "2027-01-05T13:00Z")];
    const result = generateSlots(open, config, now);
    expect(result).toEqual([iv("2027-01-05T11:00Z", "2027-01-05T11:30Z"), iv("2027-01-05T11:30Z", "2027-01-05T12:00Z")]);
  });

  test("maxPerDay counts by the event type's declared timezone, across a UTC-date boundary", () => {
    const config: SlotConfig = {
      ...baseConfig,
      durationMinutes: 90,
      slotIncrementMin: 60,
      rollingWindowDays: 2,
      timezone: "America/New_York",
      maxPerDay: 1,
    };
    // Both intervals fall on local NY date 2027-01-04 (17:00-18:30 and 20:00-22:00
    // local respectively), but the second crosses into UTC date 2027-01-05.
    const open = [iv("2027-01-04T22:00Z", "2027-01-04T23:30Z"), iv("2027-01-05T01:00Z", "2027-01-05T03:00Z")];
    const now = at("2027-01-04T00:00Z");
    const result = generateSlots(open, config, now);
    expect(result).toEqual([iv("2027-01-04T22:00Z", "2027-01-04T23:30Z")]);
  });

  test("increment alignment: candidates land on the increment grid, not on the open interval's own (off-grid) start", () => {
    const config: SlotConfig = { ...baseConfig, durationMinutes: 15, slotIncrementMin: 15 };
    const open = [iv("2027-01-04T09:07Z", "2027-01-04T10:00Z")]; // e.g. left over after busy subtraction
    const result = generateSlots(open, config, at("2027-01-04T00:00Z"));
    expect(result).toEqual([
      iv("2027-01-04T09:15Z", "2027-01-04T09:30Z"),
      iv("2027-01-04T09:30Z", "2027-01-04T09:45Z"),
      iv("2027-01-04T09:45Z", "2027-01-04T10:00Z"),
    ]);
  });

  test("maxPerDay left undefined applies no cap", () => {
    const open = [iv("2027-01-04T09:00Z", "2027-01-04T11:00Z")];
    const result = generateSlots(open, baseConfig, at("2027-01-04T00:00Z"));
    // 30min duration, 15min increment, starts 09:00..10:30 inclusive fit within the 2h window.
    expect(result.length).toBe(7);
  });
});

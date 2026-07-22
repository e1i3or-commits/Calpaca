import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  groupAvailability,
  OPTIONAL_CONFLICT_PENALTY,
  type GroupHost,
} from "../../../src/core/availability/group";
import type { SlotConfig } from "../../../src/core/availability/slots";
import type { Interval } from "../../../src/core/availability/intervals";

function at(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

function iv(startIso: string, endIso: string): Interval {
  return { start: at(startIso), end: at(endIso) };
}

const config: SlotConfig = {
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 1,
  timezone: "UTC",
  slotIncrementMin: 30,
};

const now = at("2027-01-04T00:00Z");

function host(overrides: Partial<GroupHost> & Pick<GroupHost, "userId" | "role">): GroupHost {
  return {
    open: [iv("2027-01-04T09:00Z", "2027-01-04T17:00Z")],
    busy: [],
    prefs: {},
    timezone: "UTC",
    ...overrides,
  };
}

describe("groupAvailability", () => {
  test("2 required hosts: full slots are the intersection of both free sets", () => {
    const a = host({
      userId: "a",
      role: "required",
      open: [iv("2027-01-04T09:00Z", "2027-01-04T12:00Z")],
    });
    const b = host({
      userId: "b",
      role: "required",
      open: [iv("2027-01-04T11:00Z", "2027-01-04T17:00Z")],
    });
    const result = groupAvailability([a, b], config, now);
    expect(result.fallback).toEqual([]);
    // Intersection of [09:00,12:00) and [11:00,17:00) is [11:00,12:00): two 30min slots.
    expect(result.full.map((s) => s.slot)).toEqual([
      iv("2027-01-04T11:00Z", "2027-01-04T11:30Z"),
      iv("2027-01-04T11:30Z", "2027-01-04T12:00Z"),
    ]);
  });

  test("5 required hosts: full slots require every host's free time to overlap", () => {
    const hosts: GroupHost[] = Array.from({ length: 5 }, (_, i) =>
      host({
        userId: `h${i}`,
        role: "required",
        // Each host frees up 30 minutes later than the last; only the last
        // window (13:00-17:00) is common to all five.
        open: [iv(`2027-01-04T${(9 + i).toString().padStart(2, "0")}:00Z`, "2027-01-04T17:00Z")],
      }),
    );
    const result = groupAvailability(hosts, config, now);
    expect(result.full.length).toBeGreaterThan(0);
    for (const { slot } of result.full) {
      expect(Temporal.Instant.compare(slot.start, at("2027-01-04T13:00Z"))).toBeGreaterThanOrEqual(0);
    }
  });

  test("optional-host scoring effect: a slot free for the optional outscores the identical slot when they conflict", () => {
    const a = host({ userId: "a", role: "required" });
    const targetSlot = at("2027-01-04T09:00Z");

    const optFree = host({ userId: "opt", role: "optional" });
    const scoreWhenFree = groupAvailability([a, optFree], config, now).full.find((s) =>
      s.slot.start.equals(targetSlot),
    )!.score;

    const optBusy = host({
      userId: "opt",
      role: "optional",
      busy: [iv("2027-01-04T09:00Z", "2027-01-04T09:30Z")],
    });
    const scoreWhenBusy = groupAvailability([a, optBusy], config, now).full.find((s) =>
      s.slot.start.equals(targetSlot),
    )!.score;

    // Everything else about the slot is identical between the two runs; only
    // the optional host's freeness for this exact slot differs, so the gap
    // is exactly the fixed conflict discount split across the two hosts.
    expect(scoreWhenFree - scoreWhenBusy).toBeCloseTo(OPTIONAL_CONFLICT_PENALTY / 2, 5);
  });

  test("optional hosts never gate eligibility: a slot with no optional host free is still offered", () => {
    const a = host({ userId: "a", role: "required" });
    const opt = host({
      userId: "opt",
      role: "optional",
      busy: [iv("2027-01-04T09:00Z", "2027-01-04T17:00Z")],
    });
    const result = groupAvailability([a, opt], config, now);
    expect(result.full.length).toBeGreaterThan(0);
  });

  test("quorum fallback does not trigger when the full intersection has slots", () => {
    const a = host({ userId: "a", role: "required" });
    const b = host({ userId: "b", role: "required" });
    const result = groupAvailability([a, b], config, now);
    expect(result.full.length).toBeGreaterThan(0);
    expect(result.fallback).toEqual([]);
  });

  test("quorum fallback triggers on empty full intersection and identifies the blocking host", () => {
    const a = host({ userId: "a", role: "required" });
    const b = host({ userId: "b", role: "required" });
    // c is busy all day, blocking the full three-way intersection entirely.
    const c = host({
      userId: "c",
      role: "required",
      busy: [iv("2027-01-04T09:00Z", "2027-01-04T17:00Z")],
    });
    const result = groupAvailability([a, b, c], config, now);
    expect(result.full).toEqual([]);
    expect(result.fallback.length).toBe(1);
    expect(result.fallback[0]!.missingUserId).toBe("c");
    expect(result.fallback[0]!.slots.length).toBeGreaterThan(0);
  });

  test("quorum fallback drops only one required host, never two", () => {
    const a = host({ userId: "a", role: "required" });
    // b and c each block a disjoint half of the day, so no single drop frees the whole window,
    // but each leave-one-out pair still frees its own half.
    const b = host({
      userId: "b",
      role: "required",
      busy: [iv("2027-01-04T09:00Z", "2027-01-04T13:00Z")],
    });
    const c = host({
      userId: "c",
      role: "required",
      busy: [iv("2027-01-04T13:00Z", "2027-01-04T17:00Z")],
    });
    const result = groupAvailability([a, b, c], config, now);
    expect(result.full).toEqual([]);
    const missing = result.fallback.map((f) => f.missingUserId).sort();
    // Dropping "a" still leaves b (free 13:00-17:00) and c (free 9:00-13:00)
    // with no overlap, so only single-host drops that actually unblock a
    // window (b or c) survive the empty-slots filter.
    expect(missing).toEqual(["b", "c"]);

    const droppingB = result.fallback.find((f) => f.missingUserId === "b")!;
    for (const { slot } of droppingB.slots) {
      expect(Temporal.Instant.compare(slot.start, at("2027-01-04T09:00Z"))).toBeGreaterThanOrEqual(0);
      expect(Temporal.Instant.compare(slot.end, at("2027-01-04T13:00Z"))).toBeLessThanOrEqual(0);
    }

    const droppingC = result.fallback.find((f) => f.missingUserId === "c")!;
    for (const { slot } of droppingC.slots) {
      expect(Temporal.Instant.compare(slot.start, at("2027-01-04T13:00Z"))).toBeGreaterThanOrEqual(0);
    }
  });
});

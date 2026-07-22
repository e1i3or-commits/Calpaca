import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  assign,
  explainAssignment,
  teamAvailability,
  type AssignmentCandidate,
  type BookingRecord,
  type TeamMember,
} from "../../../src/core/assignment/round-robin";
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

function member(overrides: Partial<TeamMember> & Pick<TeamMember, "userId">): TeamMember {
  return {
    open: [iv("2027-01-04T09:00Z", "2027-01-04T17:00Z")],
    busy: [],
    weight: 100,
    available: true,
    ...overrides,
  };
}

describe("teamAvailability", () => {
  test("unions per-member free sets: a slot is offered if any member is free for it", () => {
    const a = member({ userId: "a", open: [iv("2027-01-04T09:00Z", "2027-01-04T10:00Z")] });
    const b = member({ userId: "b", open: [iv("2027-01-04T09:30Z", "2027-01-04T10:00Z")] });
    const result = teamAvailability([a, b], config, now);

    const at0900 = result.find((s) => s.slot.start.equals(at("2027-01-04T09:00Z")))!;
    expect(at0900.memberIds).toEqual(["a"]);

    const at0930 = result.find((s) => s.slot.start.equals(at("2027-01-04T09:30Z")))!;
    expect(at0930.memberIds.slice().sort()).toEqual(["a", "b"]);
  });

  test("OOO members are excluded from availability without hiding other members' slots", () => {
    const a = member({ userId: "a", open: [iv("2027-01-04T09:00Z", "2027-01-04T09:30Z")] });
    const b = member({
      userId: "b",
      open: [iv("2027-01-04T09:00Z", "2027-01-04T09:30Z")],
      available: false,
    });
    const c = member({ userId: "c", open: [iv("2027-01-04T09:30Z", "2027-01-04T10:00Z")] });

    const result = teamAvailability([a, b, c], config, now);

    // b is OOO: the 09:00 slot still appears because a covers it, but b never
    // contributes to any slot's member list.
    const at0900 = result.find((s) => s.slot.start.equals(at("2027-01-04T09:00Z")))!;
    expect(at0900.memberIds).toEqual(["a"]);

    const at0930 = result.find((s) => s.slot.start.equals(at("2027-01-04T09:30Z")))!;
    expect(at0930.memberIds).toEqual(["c"]);

    for (const s of result) {
      expect(s.memberIds).not.toContain("b");
    }
  });

  test("a slot solely covered by an OOO member disappears, but never blocks slots other members can take", () => {
    const a = member({
      userId: "a",
      open: [iv("2027-01-04T09:00Z", "2027-01-04T09:30Z")],
      available: false,
    });
    const b = member({ userId: "b", open: [iv("2027-01-04T09:30Z", "2027-01-04T10:00Z")] });

    const result = teamAvailability([a, b], config, now);
    expect(result.map((s) => s.slot.start.toString())).toEqual([at("2027-01-04T09:30Z").toString()]);
  });
});

describe("assign / explainAssignment", () => {
  test("weighted distribution over 100 simulated bookings approximates the configured weights", () => {
    const candidates: AssignmentCandidate[] = [
      { userId: "a", weight: 200 },
      { userId: "b", weight: 100 },
    ];
    const slot = iv("2027-01-04T09:00Z", "2027-01-04T09:30Z");
    const history: BookingRecord[] = [];
    const counts: Record<string, number> = { a: 0, b: 0 };

    for (let i = 0; i < 100; i++) {
      const winner = assign(slot, candidates, history)!;
      counts[winner] = (counts[winner] ?? 0) + 1;
      history.push({ userId: winner, bookedAt: now.add({ minutes: i }) });
    }

    // a has 2x the weight of b, so over 100 bookings a should land near 66.7
    // and b near 33.3. Allow generous tolerance since the algorithm is a
    // deterministic greedy minimizer, not a random draw.
    expect(counts.a).toBeGreaterThan(60);
    expect(counts.a).toBeLessThan(72);
    expect(counts.b).toBeGreaterThan(28);
    expect(counts.b).toBeLessThan(40);
    expect(counts.a! + counts.b!).toBe(100);
  });

  test("OOO members are never selected because they are excluded from the candidate list", () => {
    // OOO exclusion happens by never including the member in `candidates`
    // (teamAvailability already filters them out); assign has no separate
    // OOO concept to bypass.
    const candidates: AssignmentCandidate[] = [{ userId: "a", weight: 100 }];
    const slot = iv("2027-01-04T09:00Z", "2027-01-04T09:30Z");
    expect(assign(slot, candidates, [])).toBe("a");
  });

  test("tie-break: equal load and no history falls back to userId, deterministically", () => {
    const candidates: AssignmentCandidate[] = [
      { userId: "zeta", weight: 100 },
      { userId: "alpha", weight: 100 },
      { userId: "mid", weight: 100 },
    ];
    const slot = iv("2027-01-04T09:00Z", "2027-01-04T09:30Z");

    const first = assign(slot, candidates, [])!;
    const second = assign(slot, [...candidates].reverse(), [])!;
    expect(first).toBe("alpha");
    expect(second).toBe("alpha");
  });

  test("tie-break: equal effective load with history breaks by longest time since last booking", () => {
    const candidates: AssignmentCandidate[] = [
      { userId: "a", weight: 100 },
      { userId: "b", weight: 100 },
    ];
    const slot = iv("2027-01-04T09:00Z", "2027-01-04T09:30Z");
    const history: BookingRecord[] = [
      { userId: "a", bookedAt: at("2027-01-01T00:00Z") },
      { userId: "b", bookedAt: at("2027-01-03T00:00Z") },
    ];

    // Both have bookingCount 1 (effectiveLoad 1), but a's last booking is
    // further in the past, so a wins the tie.
    expect(assign(slot, candidates, history)).toBe("a");
  });

  test("explainAssignment ranks the same winner first as assign returns, with matching load data", () => {
    const candidates: AssignmentCandidate[] = [
      { userId: "a", weight: 200 },
      { userId: "b", weight: 100 },
      { userId: "c", weight: 100 },
    ];
    const slot = iv("2027-01-04T09:00Z", "2027-01-04T09:30Z");
    const history: BookingRecord[] = [
      { userId: "a", bookedAt: at("2027-01-02T00:00Z") },
      { userId: "b", bookedAt: at("2027-01-01T00:00Z") },
      { userId: "b", bookedAt: at("2027-01-03T00:00Z") },
      { userId: "c", bookedAt: at("2027-01-01T00:00Z") },
    ];

    const winner = assign(slot, candidates, history)!;
    const explained = explainAssignment(slot, candidates, history);

    expect(explained[0]!.userId).toBe(winner);
    expect(explained.map((c) => c.userId)).toEqual(["a", "c", "b"]);
    expect(explained[0]).toEqual({
      userId: "a",
      bookingCount: 1,
      effectiveLoad: 0.5,
      lastBookedAt: at("2027-01-02T00:00Z"),
    });
  });

  test("no candidates yields no assignment", () => {
    const slot = iv("2027-01-04T09:00Z", "2027-01-04T09:30Z");
    expect(assign(slot, [], [])).toBeNull();
    expect(explainAssignment(slot, [], [])).toEqual([]);
  });
});

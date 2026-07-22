import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { clamp, intersectMany, normalize, subtract, type Interval } from "../../../src/core/availability/intervals";

function at(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

function iv(startIso: string, endIso: string): Interval {
  return { start: at(startIso), end: at(endIso) };
}

describe("normalize", () => {
  test("empty input yields empty output", () => {
    expect(normalize([])).toEqual([]);
  });

  test("single interval is unchanged", () => {
    const result = normalize([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")]);
  });

  test("sorts out-of-order intervals", () => {
    const result = normalize([iv("2027-01-01T11:00Z", "2027-01-01T12:00Z"), iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"), iv("2027-01-01T11:00Z", "2027-01-01T12:00Z")]);
  });

  test("coalesces overlapping intervals", () => {
    const result = normalize([iv("2027-01-01T09:00Z", "2027-01-01T10:30Z"), iv("2027-01-01T10:00Z", "2027-01-01T11:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T11:00Z")]);
  });

  test("coalesces overlapping intervals regardless of input order", () => {
    const result = normalize([iv("2027-01-01T10:00Z", "2027-01-01T11:00Z"), iv("2027-01-01T09:00Z", "2027-01-01T10:30Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T11:00Z")]);
  });

  test("coalesces touching intervals (adjacent endpoints)", () => {
    const result = normalize([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"), iv("2027-01-01T10:00Z", "2027-01-01T11:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T11:00Z")]);
  });

  test("chains merges across more than two overlapping/touching intervals", () => {
    const result = normalize([
      iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"),
      iv("2027-01-01T10:00Z", "2027-01-01T10:30Z"),
      iv("2027-01-01T10:15Z", "2027-01-01T12:00Z"),
    ]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T12:00Z")]);
  });

  test("keeps separate intervals that neither overlap nor touch", () => {
    const result = normalize([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"), iv("2027-01-01T10:30Z", "2027-01-01T11:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"), iv("2027-01-01T10:30Z", "2027-01-01T11:00Z")]);
  });

  test("drops zero-length and inverted intervals", () => {
    const zeroLength = { start: at("2027-01-01T09:00Z"), end: at("2027-01-01T09:00Z") };
    const inverted = { start: at("2027-01-01T10:00Z"), end: at("2027-01-01T09:00Z") };
    expect(normalize([zeroLength, inverted])).toEqual([]);
  });
});

describe("subtract", () => {
  const open = [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")];

  test("empty open yields empty output", () => {
    expect(subtract([], [iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")])).toEqual([]);
  });

  test("empty busy leaves open intervals unchanged (normalized)", () => {
    expect(subtract(open, [])).toEqual(open);
  });

  test("full overlap: busy entirely covers open yields empty", () => {
    expect(subtract(open, [iv("2027-01-01T08:00Z", "2027-01-01T18:00Z")])).toEqual([]);
  });

  test("full overlap: busy exactly equal to open yields empty", () => {
    expect(subtract(open, [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")])).toEqual([]);
  });

  test("partial overlap from the left leaves the right remainder", () => {
    const result = subtract(open, [iv("2027-01-01T08:00Z", "2027-01-01T11:00Z")]);
    expect(result).toEqual([iv("2027-01-01T11:00Z", "2027-01-01T17:00Z")]);
  });

  test("partial overlap from the right leaves the left remainder", () => {
    const result = subtract(open, [iv("2027-01-01T15:00Z", "2027-01-01T18:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T15:00Z")]);
  });

  test("busy in the middle splits open into two remainders", () => {
    const result = subtract(open, [iv("2027-01-01T12:00Z", "2027-01-01T13:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T12:00Z"), iv("2027-01-01T13:00Z", "2027-01-01T17:00Z")]);
  });

  test("multiple busy intervals carve out multiple gaps", () => {
    const result = subtract(open, [
      iv("2027-01-01T10:00Z", "2027-01-01T11:00Z"),
      iv("2027-01-01T13:00Z", "2027-01-01T14:00Z"),
      iv("2027-01-01T16:00Z", "2027-01-01T17:00Z"),
    ]);
    expect(result).toEqual([
      iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"),
      iv("2027-01-01T11:00Z", "2027-01-01T13:00Z"),
      iv("2027-01-01T14:00Z", "2027-01-01T16:00Z"),
    ]);
  });

  test("busy touching the start of open does not create a zero-length remainder", () => {
    const result = subtract(open, [iv("2027-01-01T08:00Z", "2027-01-01T09:00Z")]);
    expect(result).toEqual(open);
    expect(result.some((r) => r.start.equals(r.end))).toBe(false);
  });

  test("busy touching the end of open does not create a zero-length remainder", () => {
    const result = subtract(open, [iv("2027-01-01T17:00Z", "2027-01-01T18:00Z")]);
    expect(result).toEqual(open);
    expect(result.some((r) => r.start.equals(r.end))).toBe(false);
  });

  test("busy touching both edges of open from outside leaves open untouched", () => {
    const result = subtract(open, [iv("2027-01-01T08:00Z", "2027-01-01T09:00Z"), iv("2027-01-01T17:00Z", "2027-01-01T18:00Z")]);
    expect(result).toEqual(open);
  });

  test("adjacent busy chunks inside open never leave a zero-length sliver", () => {
    const result = subtract(open, [iv("2027-01-01T10:00Z", "2027-01-01T11:00Z"), iv("2027-01-01T11:00Z", "2027-01-01T12:00Z")]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"), iv("2027-01-01T12:00Z", "2027-01-01T17:00Z")]);
    expect(result.some((r) => r.start.equals(r.end))).toBe(false);
  });
});

describe("intersectMany", () => {
  test("empty array of sets yields empty output", () => {
    expect(intersectMany([])).toEqual([]);
  });

  test("one set returns its normalized form", () => {
    const result = intersectMany([[iv("2027-01-01T10:00Z", "2027-01-01T11:00Z"), iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")]]);
    expect(result).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T11:00Z")]);
  });

  test("two overlapping sets intersect to the common window", () => {
    const a = [iv("2027-01-01T09:00Z", "2027-01-01T12:00Z")];
    const b = [iv("2027-01-01T10:00Z", "2027-01-01T13:00Z")];
    expect(intersectMany([a, b])).toEqual([iv("2027-01-01T10:00Z", "2027-01-01T12:00Z")]);
  });

  test("two disjoint sets intersect to empty", () => {
    const a = [iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")];
    const b = [iv("2027-01-01T11:00Z", "2027-01-01T12:00Z")];
    expect(intersectMany([a, b])).toEqual([]);
  });

  test("five overlapping sets intersect to the narrowest common window", () => {
    const sets = [
      [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")],
      [iv("2027-01-01T09:30Z", "2027-01-01T16:00Z")],
      [iv("2027-01-01T10:00Z", "2027-01-01T15:00Z")],
      [iv("2027-01-01T09:00Z", "2027-01-01T14:00Z")],
      [iv("2027-01-01T11:00Z", "2027-01-01T18:00Z")],
    ];
    expect(intersectMany(sets)).toEqual([iv("2027-01-01T11:00Z", "2027-01-01T14:00Z")]);
  });

  test("five sets including one empty set yields empty result", () => {
    const sets = [
      [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")],
      [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")],
      [] as Interval[],
      [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")],
      [iv("2027-01-01T09:00Z", "2027-01-01T17:00Z")],
    ];
    expect(intersectMany(sets)).toEqual([]);
  });

  test("multiple disjoint pairs across sets produce multiple intersection intervals", () => {
    const a = [iv("2027-01-01T09:00Z", "2027-01-01T10:00Z"), iv("2027-01-01T13:00Z", "2027-01-01T14:00Z")];
    const b = [iv("2027-01-01T09:30Z", "2027-01-01T09:45Z"), iv("2027-01-01T13:30Z", "2027-01-01T14:30Z")];
    expect(intersectMany([a, b])).toEqual([iv("2027-01-01T09:30Z", "2027-01-01T09:45Z"), iv("2027-01-01T13:30Z", "2027-01-01T14:00Z")]);
  });
});

describe("clamp", () => {
  const window = iv("2027-01-01T09:00Z", "2027-01-01T17:00Z");

  test("empty input yields empty output", () => {
    expect(clamp([], window)).toEqual([]);
  });

  test("interval fully inside the window is unchanged", () => {
    expect(clamp([iv("2027-01-01T10:00Z", "2027-01-01T11:00Z")], window)).toEqual([iv("2027-01-01T10:00Z", "2027-01-01T11:00Z")]);
  });

  test("interval extending past the right edge is truncated", () => {
    expect(clamp([iv("2027-01-01T16:00Z", "2027-01-01T18:00Z")], window)).toEqual([iv("2027-01-01T16:00Z", "2027-01-01T17:00Z")]);
  });

  test("interval extending past the left edge is truncated", () => {
    expect(clamp([iv("2027-01-01T08:00Z", "2027-01-01T10:00Z")], window)).toEqual([iv("2027-01-01T09:00Z", "2027-01-01T10:00Z")]);
  });

  test("interval entirely outside the window is dropped", () => {
    expect(clamp([iv("2027-01-01T18:00Z", "2027-01-01T19:00Z")], window)).toEqual([]);
  });

  test("interval merely touching the window boundary is dropped, not zero-length", () => {
    const result = clamp([iv("2027-01-01T17:00Z", "2027-01-01T18:00Z")], window);
    expect(result).toEqual([]);
  });
});

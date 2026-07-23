import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { bucketStart, decide } from "../../../src/core/ratelimit/window";

describe("fixed-window rate limiting", () => {
  test("bucketStart floors UTC epoch time to the requested window", () => {
    const now = Temporal.Instant.from("2027-01-04T09:12:59.999Z");
    expect(bucketStart(now, 60).toString()).toBe("2027-01-04T09:12:00Z");
    expect(bucketStart(now, 300).toString()).toBe("2027-01-04T09:10:00Z");
  });

  test("DST transition is a non-event because buckets use UTC instants", () => {
    const beforeSpringForward = Temporal.Instant.from("2027-03-14T06:59:59.999Z");
    const afterSpringForward = Temporal.Instant.from("2027-03-14T07:00:00Z");

    expect(bucketStart(beforeSpringForward, 60).toString()).toBe("2027-03-14T06:59:00Z");
    expect(bucketStart(afterSpringForward, 60).toString()).toBe("2027-03-14T07:00:00Z");
  });

  test("decision allows through the limit and denies the next increment", () => {
    expect(decide(4, 5, 23.2)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(decide(5, 5, 23.2)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
    expect(decide(6, 5, 23.2)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 24,
    });
  });
});

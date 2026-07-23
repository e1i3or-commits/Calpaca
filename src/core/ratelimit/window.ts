import { Temporal } from "@js-temporal/polyfill";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/** Floors an instant into a UTC epoch-aligned fixed window. */
export function bucketStart(
  now: Temporal.Instant,
  windowSeconds: number,
): Temporal.Instant {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new RangeError("windowSeconds must be a positive integer");
  }
  const windowMs = windowSeconds * 1_000;
  return Temporal.Instant.fromEpochMilliseconds(
    Math.floor(now.epochMilliseconds / windowMs) * windowMs,
  );
}

/** Interprets the count returned by the atomic increment. */
export function decide(
  count: number,
  limit: number,
  retryAfterSeconds: number,
): RateLimitDecision {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer");
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: count <= limit ? 0 : Math.max(1, Math.ceil(retryAfterSeconds)),
  };
}

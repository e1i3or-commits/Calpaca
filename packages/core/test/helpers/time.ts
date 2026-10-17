import { Temporal } from "@js-temporal/polyfill";

export interface Interval {
  readonly start: Temporal.ZonedDateTime;
  readonly end: Temporal.ZonedDateTime;
}

/** Parses an ISO-8601 UTC instant (e.g. "2027-03-14T09:00Z") into a UTC ZonedDateTime. */
export function utc(iso: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(iso).toZonedDateTimeISO("UTC");
}

/**
 * Builds a ZonedDateTime from a naive local datetime (e.g. "2027-03-14 09:00")
 * interpreted in the given IANA zone. Defaults to "compatible" disambiguation
 * for DST gaps/folds (the offset a real calendar client would pick); tests
 * that need to probe both sides of a fold/gap can pass "earlier" or "later".
 */
export function zoned(
  localDateTime: string,
  timeZone: string,
  disambiguation: Temporal.ToInstantOptions["disambiguation"] = "compatible",
): Temporal.ZonedDateTime {
  const isoLocal = localDateTime.replace(" ", "T");
  return Temporal.PlainDateTime.from(isoLocal).toZonedDateTime(timeZone, { disambiguation });
}

export function interval(start: Temporal.ZonedDateTime, end: Temporal.ZonedDateTime): Interval {
  return { start, end };
}

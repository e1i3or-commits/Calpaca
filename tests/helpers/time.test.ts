import { describe, expect, test } from "bun:test";
import { interval, utc, zoned } from "./time";
import { dstFixtures, phoenixNoDst, sydneySpringForward, usFallBack, usSpringForward } from "./fixtures";

describe("utc", () => {
  test("round-trips an ISO instant", () => {
    const z = utc("2027-03-14T09:00Z");
    expect(z.toInstant().toString()).toBe("2027-03-14T09:00:00Z");
    expect(z.timeZoneId).toBe("UTC");
  });
});

describe("zoned", () => {
  test("round-trips a local wall-clock time in a zone", () => {
    const z = zoned("2027-06-01 09:00", "America/New_York");
    expect(z.toPlainDateTime().toString()).toBe("2027-06-01T09:00:00");
    expect(z.timeZoneId).toBe("America/New_York");
    expect(z.offset).toBe("-04:00");
  });
});

describe("interval", () => {
  test("carries start and end through unchanged", () => {
    const start = utc("2027-01-01T00:00Z");
    const end = utc("2027-01-01T01:00Z");
    const i = interval(start, end);
    expect(i.start).toBe(start);
    expect(i.end).toBe(end);
  });
});

describe("DST fixtures", () => {
  for (const fixture of dstFixtures) {
    test(`${fixture.name}: earlier/later disambiguation agrees only where no transition exists`, () => {
      const earlier = zoned(fixture.localTransition, fixture.timeZone, "earlier");
      const later = zoned(fixture.localTransition, fixture.timeZone, "later");
      const hasTransition = fixture !== phoenixNoDst;
      expect(earlier.toInstant().equals(later.toInstant())).toBe(!hasTransition);
    });
  }

  test("US spring-forward skips the wall-clock hour", () => {
    const before = zoned("2027-03-14 01:59", usSpringForward.timeZone);
    const at = zoned(usSpringForward.localTransition, usSpringForward.timeZone);
    expect(before.offset).toBe("-05:00");
    expect(at.offset).toBe("-04:00");
    expect(at.hour).toBe(3); // 02:00 doesn't exist; "compatible" shifts into the gap
  });

  test("US fall-back repeats the wall-clock hour", () => {
    const earlier = zoned("2027-11-07 01:30", usFallBack.timeZone, "earlier");
    const later = zoned("2027-11-07 01:30", usFallBack.timeZone, "later");
    expect(earlier.offset).toBe("-04:00");
    expect(later.offset).toBe("-05:00");
    expect(later.toInstant().epochMilliseconds - earlier.toInstant().epochMilliseconds).toBe(3600_000);
  });

  test("Sydney spring-forward skips the wall-clock hour", () => {
    const before = zoned("2027-10-03 01:59", sydneySpringForward.timeZone);
    const at = zoned(sydneySpringForward.localTransition, sydneySpringForward.timeZone);
    expect(before.offset).toBe("+10:00");
    expect(at.offset).toBe("+11:00");
  });

  test("Phoenix never observes DST", () => {
    const before = zoned("2027-03-14 01:59", phoenixNoDst.timeZone);
    const at = zoned(phoenixNoDst.localTransition, phoenixNoDst.timeZone);
    expect(before.offset).toBe(at.offset);
    expect(at.hour).toBe(2); // no gap here: 02:00 exists as a normal local time
  });
});

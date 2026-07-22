import { describe, expect, test } from "bun:test";
import { mapEventToBusyChange, type GoogleEvent } from "../../src/sync/busy-mapping";

const TZ = "America/New_York";

function timed(id: string, start: string, end: string): GoogleEvent {
  return { id, status: "confirmed", start: { dateTime: start }, end: { dateTime: end } };
}

describe("mapEventToBusyChange", () => {
  test("confirmed timed event maps to upsert with UTC instants", () => {
    const change = mapEventToBusyChange(
      timed("ev1", "2026-07-22T10:00:00-04:00", "2026-07-22T10:30:00-04:00"),
      TZ,
    );
    expect(change).toEqual({
      kind: "upsert",
      externalEventId: "ev1",
      startsAt: new Date("2026-07-22T14:00:00Z"),
      endsAt: new Date("2026-07-22T14:30:00Z"),
    });
  });

  test("tentative events still block time", () => {
    const change = mapEventToBusyChange(
      { ...timed("ev2", "2026-07-22T10:00:00Z", "2026-07-22T11:00:00Z"), status: "tentative" },
      TZ,
    );
    expect(change?.kind).toBe("upsert");
  });

  test("cancelled event maps to delete", () => {
    expect(mapEventToBusyChange({ id: "gone", status: "cancelled" }, TZ)).toEqual({
      kind: "delete",
      externalEventId: "gone",
    });
  });

  test("transparent (shows-as-free) event maps to delete", () => {
    const change = mapEventToBusyChange(
      { ...timed("free1", "2026-07-22T10:00:00Z", "2026-07-22T11:00:00Z"), transparency: "transparent" },
      TZ,
    );
    expect(change).toEqual({ kind: "delete", externalEventId: "free1" });
  });

  test("workingLocation and birthday events never block time", () => {
    for (const eventType of ["workingLocation", "birthday"]) {
      const change = mapEventToBusyChange(
        { ...timed("meta1", "2026-07-22T00:00:00Z", "2026-07-23T00:00:00Z"), eventType },
        TZ,
      );
      expect(change).toEqual({ kind: "delete", externalEventId: "meta1" });
    }
  });

  test("all-day event spans midnight-to-midnight in the calendar timezone", () => {
    const change = mapEventToBusyChange(
      { id: "allday", status: "confirmed", start: { date: "2026-07-04" }, end: { date: "2026-07-05" } },
      TZ,
    );
    // midnight New York = 04:00 UTC during EDT
    expect(change).toEqual({
      kind: "upsert",
      externalEventId: "allday",
      startsAt: new Date("2026-07-04T04:00:00Z"),
      endsAt: new Date("2026-07-05T04:00:00Z"),
    });
  });

  test("all-day event across spring-forward DST covers the 23h day exactly", () => {
    // 2026-03-08: US spring forward; midnight-to-midnight NY is 23 hours
    const change = mapEventToBusyChange(
      { id: "dst1", status: "confirmed", start: { date: "2026-03-08" }, end: { date: "2026-03-09" } },
      TZ,
    );
    expect(change).toEqual({
      kind: "upsert",
      externalEventId: "dst1",
      startsAt: new Date("2026-03-08T05:00:00Z"), // EST midnight
      endsAt: new Date("2026-03-09T04:00:00Z"),   // EDT midnight
    });
    const hours =
      ((change as { endsAt: Date }).endsAt.getTime() -
        (change as { startsAt: Date }).startsAt.getTime()) /
      3_600_000;
    expect(hours).toBe(23);
  });

  test("all-day event across fall-back DST covers the 25h day exactly", () => {
    // 2026-11-01: US fall back; midnight-to-midnight NY is 25 hours
    const change = mapEventToBusyChange(
      { id: "dst2", status: "confirmed", start: { date: "2026-11-01" }, end: { date: "2026-11-02" } },
      TZ,
    );
    const upsert = change as { startsAt: Date; endsAt: Date };
    expect(upsert.startsAt).toEqual(new Date("2026-11-01T04:00:00Z")); // EDT midnight
    expect(upsert.endsAt).toEqual(new Date("2026-11-02T05:00:00Z"));   // EST midnight
    expect((upsert.endsAt.getTime() - upsert.startsAt.getTime()) / 3_600_000).toBe(25);
  });

  test("timed event during a DST transition keeps its absolute instants", () => {
    // 01:30 EST on fall-back day, offset given explicitly by Google
    const change = mapEventToBusyChange(
      timed("dst3", "2026-11-01T01:30:00-05:00", "2026-11-01T02:30:00-05:00"),
      TZ,
    );
    expect(change).toEqual({
      kind: "upsert",
      externalEventId: "dst3",
      startsAt: new Date("2026-11-01T06:30:00Z"),
      endsAt: new Date("2026-11-01T07:30:00Z"),
    });
  });

  test("events without time information map to null", () => {
    expect(mapEventToBusyChange({ id: "empty", status: "confirmed" }, TZ)).toBeNull();
  });

  test("zero-length and inverted events map to null", () => {
    expect(
      mapEventToBusyChange(timed("zero", "2026-07-22T10:00:00Z", "2026-07-22T10:00:00Z"), TZ),
    ).toBeNull();
    expect(
      mapEventToBusyChange(timed("inv", "2026-07-22T11:00:00Z", "2026-07-22T10:00:00Z"), TZ),
    ).toBeNull();
  });
});

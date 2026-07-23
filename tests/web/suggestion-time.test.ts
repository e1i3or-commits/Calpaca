import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  isFutureInstant,
  localSuggestionWindow,
} from "../../web/src/lib/time";

describe("suggestion time conversion", () => {
  test("converts invitee-local windows to UTC and derives the end", async () => {
    const window = await localSuggestionWindow(
      "2026-08-03",
      "13:30",
      "America/New_York",
      45,
    );
    expect(window).toEqual({
      start: "2026-08-03T17:30:00Z",
      end: "2026-08-03T18:15:00Z",
    });
  });

  test("rejects nonexistent DST wall-clock times", async () => {
    expect(
      localSuggestionWindow("2027-03-14", "02:30", "America/New_York", 30),
    ).rejects.toThrow();
  });

  test("future validation compares absolute instants", async () => {
    expect(await isFutureInstant(Temporal.Now.instant().add({ minutes: 1 }).toString())).toBe(true);
    expect(await isFutureInstant(Temporal.Now.instant().subtract({ minutes: 1 }).toString())).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { guestsToInvite, MAX_GUESTS, parseGuestEmails } from "../../../src/core/booking/guests";

const INVITEE = "invitee@example.com";
const HOSTS = ["host@example.com"];

function parse(raw: readonly string[]) {
  return parseGuestEmails(raw, INVITEE, HOSTS);
}

describe("parseGuestEmails", () => {
  test("keeps a plain list in the order given", () => {
    const result = parse(["a@example.com", "b@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["a@example.com", "b@example.com"]);
  });

  test("trims and lowercases, so two spellings of one address collapse", () => {
    const result = parse(["  Guest@Example.COM ", "guest@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["guest@example.com"]);
  });

  // Both are already attendees. A repeat would become a duplicate Google
  // attendee on the event.
  test("drops the invitee's own address and any host address", () => {
    const result = parse(["INVITEE@example.com", "host@example.com", "real@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["real@example.com"]);
  });

  test("skips blank entries rather than failing, since the form leaves empty inputs", () => {
    const result = parse(["", "   ", "a@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["a@example.com"]);
  });

  test("an empty list is valid and yields an empty list", () => {
    const result = parse([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  test.each([
    "not-an-email",
    "no@domain",
    "two@@example.com",
    "spaces in@example.com",
    "@example.com",
    "trailing@example.com.",
  ])("rejects %s", (bad) => {
    const result = parse([bad]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_email");
      if (result.error.kind === "invalid_email") expect(result.error.value).toBe(bad);
    }
  });

  test("accepts exactly MAX_GUESTS", () => {
    const raw = Array.from({ length: MAX_GUESTS }, (_, i) => `g${i}@example.com`);
    const result = parse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(MAX_GUESTS);
  });

  test("rejects one more than MAX_GUESTS", () => {
    const raw = Array.from({ length: MAX_GUESTS + 1 }, (_, i) => `g${i}@example.com`);
    const result = parse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("too_many");
      if (result.error.kind === "too_many") expect(result.error.max).toBe(MAX_GUESTS);
    }
  });

  // The cap applies to what is actually invited, so duplicates must not
  // consume a slot.
  test("counts unique addresses against the cap, not raw entries", () => {
    const raw = [
      ...Array.from({ length: MAX_GUESTS }, (_, i) => `g${i}@example.com`),
      "g0@example.com",
    ];
    const result = parse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(MAX_GUESTS);
  });

  test("does not mutate the caller's array", () => {
    const raw = ["B@example.com", "a@example.com"];
    parse(raw);
    expect(raw).toEqual(["B@example.com", "a@example.com"]);
  });
});

describe("guestsToInvite", () => {
  test("returns a stored list unchanged when nobody else is attending it", () => {
    expect(guestsToInvite(["a@example.com"], INVITEE, HOSTS)).toEqual(["a@example.com"]);
  });

  // A host can be added to the event type after the booking was made. Sending
  // to them as a guest would duplicate them on the calendar event.
  test("drops a guest who has since become a host", () => {
    expect(guestsToInvite(
      ["later-host@example.com", "a@example.com"],
      INVITEE,
      ["host@example.com", "later-host@example.com"],
    )).toEqual(["a@example.com"]);
  });

  test("drops the invitee and compares case-insensitively", () => {
    expect(guestsToInvite(["INVITEE@example.com", "a@example.com"], INVITEE, HOSTS))
      .toEqual(["a@example.com"]);
  });

  test("an empty stored list yields an empty list", () => {
    expect(guestsToInvite([], INVITEE, HOSTS)).toEqual([]);
  });
});

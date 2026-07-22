import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { buildIcs, type IcsInput } from "../../../src/core/invite/ics";

const base: IcsInput = {
  method: "REQUEST",
  uid: "b1@scheduler.test",
  sequence: 0,
  dtStamp: Temporal.Instant.from("2026-07-22T15:00:00Z"),
  start: Temporal.Instant.from("2026-07-22T20:30:00Z"),
  end: Temporal.Instant.from("2026-07-22T21:00:00Z"),
  summary: "Intro call",
  organizer: { name: "Kai", email: "host@example.com" },
  attendees: [{ name: "Invitee", email: "invitee@example.com" }],
};

describe("buildIcs", () => {
  test("emits a REQUEST with UTC instants and CRLF line endings", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20260722T203000Z\r\n");
    expect(ics).toContain("DTEND:20260722T210000Z\r\n");
    expect(ics).toContain("DTSTAMP:20260722T150000Z\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics).toContain("UID:b1@scheduler.test\r\n");
    expect(ics).toContain("SEQUENCE:0\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // no bare LF anywhere: every newline is CRLF
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  test("CANCEL sets STATUS:CANCELLED and keeps the UID", () => {
    const ics = buildIcs({ ...base, method: "CANCEL", sequence: 2 });
    expect(ics).toContain("METHOD:CANCEL\r\n");
    expect(ics).toContain("STATUS:CANCELLED\r\n");
    expect(ics).toContain("SEQUENCE:2\r\n");
    expect(ics).toContain("UID:b1@scheduler.test\r\n");
  });

  test("organizer and attendee render as mailto lines with CN", () => {
    // the attendee line exceeds 75 octets, so unfold before matching
    const unfolded = buildIcs(base).replace(/\r\n /g, "");
    expect(unfolded).toContain("ORGANIZER;CN=Kai:mailto:host@example.com");
    expect(unfolded).toContain(
      "ATTENDEE;CN=Invitee;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:invitee@example.com",
    );
  });

  test("escapes commas, semicolons, backslashes, and newlines in text", () => {
    const ics = buildIcs({
      ...base,
      summary: "Plan; review, part 1\\2",
      description: "line one\nline two",
    });
    expect(ics).toContain("SUMMARY:Plan\\; review\\, part 1\\\\2");
    expect(ics).toContain("DESCRIPTION:line one\\nline two");
  });

  test("folds lines longer than 75 octets with CRLF + space", () => {
    const ics = buildIcs({ ...base, summary: "x".repeat(200) });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // unfolding restores the original content
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"x".repeat(200)}`);
  });

  test("truncates sub-second precision instead of emitting fractions", () => {
    const ics = buildIcs({ ...base, dtStamp: Temporal.Instant.from("2026-07-22T15:00:00.123Z") });
    expect(ics).toContain("DTSTAMP:20260722T150000Z\r\n");
  });
});

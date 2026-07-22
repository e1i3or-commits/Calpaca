import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeInviteEmail } from "../../../src/core/invite/email";

/** The "reminder" kind, added with the reminder-sweep job. Split from
 * email.test.ts; same conventions, same module under test. */

const input = {
  kind: "reminder" as const,
  eventTitle: "Intro call",
  inviteeName: "Ada",
  hostName: "Kai",
  start: Temporal.Instant.from("2026-08-01T14:00:00Z"),
  end: Temporal.Instant.from("2026-08-01T14:30:00Z"),
  timezone: "America/New_York",
  links: {
    reschedule: "https://example.test/reschedule/b1?token=r",
    cancel: "https://example.test/cancel/b1?token=c",
  },
};

describe("composeInviteEmail reminder", () => {
  test("subject leads with Reminder and renders invitee-local time", () => {
    const email = composeInviteEmail(input);
    expect(email.subject).toStartWith("Reminder: Intro call with Kai");
    // 14:00Z is 10:00 AM in New York on that date (EDT)
    expect(email.subject).toContain("10:00 AM");
  });

  test("body says the meeting is coming up and keeps the manage links", () => {
    const email = composeInviteEmail(input);
    expect(email.text).toContain("A reminder: your Intro call with Kai is coming up.");
    expect(email.text).toContain("When:");
    expect(email.text).toContain(input.links.reschedule);
    expect(email.text).toContain(input.links.cancel);
  });

  test("omits links when PUBLIC_URL is unset upstream", () => {
    const email = composeInviteEmail({ ...input, links: null });
    expect(email.text).not.toContain("Reschedule:");
    expect(email.text).not.toContain("Cancel:");
  });
});

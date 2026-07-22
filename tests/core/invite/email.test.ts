import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeInviteEmail, type InviteEmailInput } from "../../../src/core/invite/email";

const base: InviteEmailInput = {
  kind: "created",
  eventTitle: "Intro call",
  inviteeName: "Ada",
  hostName: "Kai",
  start: Temporal.Instant.from("2026-07-22T20:30:00Z"),
  end: Temporal.Instant.from("2026-07-22T21:00:00Z"),
  timezone: "America/New_York",
  links: {
    reschedule: "https://sched.example/reschedule/b1?token=r",
    cancel: "https://sched.example/cancel/b1?token=c",
  },
};

describe("composeInviteEmail", () => {
  test("created: renders invitee-local time and both links", () => {
    const email = composeInviteEmail(base);
    expect(email.subject).toContain("Confirmed: Intro call with Kai");
    // 20:30Z is 4:30 PM in America/New_York on a July (DST) date
    expect(email.subject).toContain("4:30");
    expect(email.text).toContain("Hi Ada,");
    expect(email.text).toContain("4:30");
    expect(email.text).toContain("5:00");
    expect(email.text).toContain("(America/New_York)");
    expect(email.text).toContain("https://sched.example/reschedule/b1?token=r");
    expect(email.text).toContain("https://sched.example/cancel/b1?token=c");
  });

  test("rendering is DST-aware: same instant, different zone offsets", () => {
    const winter = composeInviteEmail({
      ...base,
      start: Temporal.Instant.from("2026-01-22T20:30:00Z"),
      end: Temporal.Instant.from("2026-01-22T21:00:00Z"),
    });
    // 20:30Z is 3:30 PM EST in January
    expect(winter.text).toContain("3:30");
  });

  test("cancelled: no links, no attachment hint, original time labelled", () => {
    const email = composeInviteEmail({ ...base, kind: "cancelled" });
    expect(email.subject).toContain("Cancelled:");
    expect(email.text).toContain("has been cancelled");
    expect(email.text).toContain("Original time:");
    expect(email.text).not.toContain("Reschedule:");
    expect(email.text).not.toContain("calendar file is attached");
  });

  test("links omitted cleanly when PUBLIC_URL is not configured", () => {
    const email = composeInviteEmail({ ...base, links: null });
    expect(email.text).not.toContain("Reschedule:");
    expect(email.text).not.toContain("Cancel:");
    expect(email.text).toContain("calendar file is attached");
  });

  test("rescheduled: subject prefix and body reflect the change", () => {
    const email = composeInviteEmail({ ...base, kind: "rescheduled" });
    expect(email.subject).toContain("Rescheduled:");
    expect(email.text).toContain("has been rescheduled");
    expect(email.text).toContain("When:");
  });
});

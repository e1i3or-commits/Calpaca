import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeInviteEmail } from "../../../src/core/invite/email";

// Booking-form notes render in the invite email (hosts are cc'd, so this is
// how they see them) — except on cancellations, where they'd be noise.

const base = {
  eventTitle: "30-Min Meeting",
  inviteeName: "Ada",
  hostName: "Kai",
  start: Temporal.Instant.from("2026-08-05T15:15:00Z"),
  end: Temporal.Instant.from("2026-08-05T15:45:00Z"),
  timezone: "America/New_York",
  links: null,
} as const;

describe("composeInviteEmail notes", () => {
  test("created email carries the invitee's notes with attribution", () => {
    const email = composeInviteEmail({
      ...base,
      kind: "created",
      notes: "We want to discuss the Q3 fleet rollout.",
    });
    expect(email.text).toContain("Notes from Ada:");
    expect(email.text).toContain("We want to discuss the Q3 fleet rollout.");
  });

  test("no notes, no notes block", () => {
    const email = composeInviteEmail({ ...base, kind: "created" });
    expect(email.text).not.toContain("Notes from");
  });

  test("null notes (row loaded without any) also omit the block", () => {
    const email = composeInviteEmail({ ...base, kind: "reminder", notes: null });
    expect(email.text).not.toContain("Notes from");
  });

  test("cancelled emails drop the notes", () => {
    const email = composeInviteEmail({ ...base, kind: "cancelled", notes: "irrelevant now" });
    expect(email.text).not.toContain("Notes from");
    expect(email.text).not.toContain("irrelevant now");
  });
});

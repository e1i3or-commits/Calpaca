import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeInviteEmail } from "../../../src/core/invite/email";

// When the booking was written to Google Calendar (icsAttached: false), the
// email must not claim a calendar file is attached — Google sends the native
// invite separately. Default (flag omitted) keeps the ICS wording.

const base = {
  eventTitle: "30-Min Meeting",
  inviteeName: "Ada",
  hostName: "Kai",
  start: Temporal.Instant.from("2026-08-05T15:15:00Z"),
  end: Temporal.Instant.from("2026-08-05T15:45:00Z"),
  timezone: "America/New_York",
  links: null,
} as const;

describe("composeInviteEmail icsAttached flag", () => {
  test("icsAttached: false swaps the attachment line for the Google note", () => {
    const email = composeInviteEmail({ ...base, kind: "created", icsAttached: false });
    expect(email.text).toContain("A Google Calendar invite is on its way");
    expect(email.text).not.toContain("calendar file is attached");
  });

  test("default keeps the ICS attachment wording", () => {
    const email = composeInviteEmail({ ...base, kind: "created" });
    expect(email.text).toContain("A calendar file is attached");
    expect(email.text).not.toContain("Google Calendar invite is on its way");
  });

  test("cancelled emails mention neither — there is nothing to add", () => {
    const email = composeInviteEmail({ ...base, kind: "cancelled", icsAttached: false });
    expect(email.text).not.toContain("calendar file is attached");
    expect(email.text).not.toContain("Google Calendar invite is on its way");
  });
});

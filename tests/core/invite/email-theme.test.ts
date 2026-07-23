import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeInviteEmail } from "../../../src/core/invite/email";
import { composeSuggestionEmail } from "../../../src/core/invite/suggestion-email";

describe("themed email composition", () => {
  test("applies TourScale colors and whitelabel logo to lifecycle emails", () => {
    const mail = composeInviteEmail({
      kind: "created",
      eventTitle: "Strategy session",
      inviteeName: "Ada",
      hostName: "Kai",
      start: Temporal.Instant.from("2026-08-03T17:00:00Z"),
      end: Temporal.Instant.from("2026-08-03T17:30:00Z"),
      timezone: "America/New_York",
      links: null,
      theme: "tourscale",
      brandLogoUrl: "https://cal.example/brand/tourscale.svg",
    });
    expect(mail.html).toContain("#f86e4f");
    expect(mail.html).toContain("https://cal.example/brand/tourscale.svg");
    expect(mail.html).toContain("2px solid #1a1a2e");
  });

  test("uses the selected event theme for suggestion notifications", () => {
    const mail = composeSuggestionEmail({
      eventTypeTitle: "Design review",
      invitee: { name: "Ivy", email: "ivy@example.com", timezone: "UTC" },
      host: { name: "Harper", timezone: "UTC" },
      proposedSlots: [{
        start: Temporal.Instant.from("2026-08-03T17:00:00Z"),
        end: Temporal.Instant.from("2026-08-03T17:30:00Z"),
      }],
      theme: "juniper",
    });
    expect(mail.html).toContain("#28775a");
    expect(mail.html).toContain("#edf4ef");
  });
});

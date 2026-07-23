import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeSuggestionEmail } from "../../../src/core/invite/suggestion-email";

describe("suggestion email", () => {
  test("renders every window in host and invitee timezones", () => {
    const mail = composeSuggestionEmail({
      eventTypeTitle: "Design review",
      invitee: { name: "Ivy", email: "ivy@example.com", timezone: "America/Los_Angeles" },
      host: { name: "Harper", timezone: "America/New_York" },
      proposedSlots: [{
        start: Temporal.Instant.from("2026-08-03T17:00:00Z"),
        end: Temporal.Instant.from("2026-08-03T17:30:00Z"),
      }],
      message: "<Tuesday works>",
    });
    expect(mail.text).toContain("America/New_York");
    expect(mail.text).toContain("America/Los_Angeles");
    expect(mail.html).toContain("America/New_York");
    expect(mail.html).toContain("America/Los_Angeles");
    expect(mail.html).toContain("&lt;Tuesday works&gt;");
  });
});

import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeInviteEmail } from "../../../src/core/invite/email";

const input = {
  kind: "created" as const,
  eventTitle: "30-Min Meeting",
  inviteeName: "Kai",
  hostName: "Host",
  start: Temporal.Instant.from("2026-07-27T19:00:00Z"),
  end: Temporal.Instant.from("2026-07-27T19:30:00Z"),
  timezone: "America/New_York",
  links: {
    reschedule: "https://cal.example/reschedule/b1?token=one&source=email",
    cancel: "https://cal.example/cancel/b1?token=two",
  },
};

describe("composeInviteEmail HTML", () => {
  test("renders tidy labeled hyperlinks while retaining plain-text URLs", () => {
    const email = composeInviteEmail(input);

    expect(email.html).toContain(
      'href="https://cal.example/reschedule/b1?token=one&amp;source=email"',
    );
    expect(email.html).toContain(">Reschedule</a>");
    expect(email.html).toContain(
      'href="https://cal.example/cancel/b1?token=two"',
    );
    expect(email.html).toContain(">Cancel booking</a>");
    expect(email.html).not.toContain(">https://cal.example/");
    expect(email.text).toContain(input.links.reschedule);
    expect(email.text).toContain(input.links.cancel);
  });

  test("escapes attendee-controlled content and preserves note line breaks", () => {
    const email = composeInviteEmail({
      ...input,
      inviteeName: "<Kai & Co>",
      notes: '<script>alert("x")</script>\nSecond line',
    });

    expect(email.html).toContain("&lt;Kai &amp; Co&gt;");
    expect(email.html).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\nSecond line",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("white-space:pre-wrap");
  });

  test("cancellation omits management links and calendar guidance", () => {
    const email = composeInviteEmail({ ...input, kind: "cancelled" });

    expect(email.html).toContain("Original time");
    expect(email.html).not.toContain('href="');
    expect(email.html).not.toContain("calendar file");
    expect(email.html).not.toContain("Google Calendar invite");
  });
});

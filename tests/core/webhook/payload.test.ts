import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  buildWebhookBody,
  matchesSubscription,
  type WebhookPayloadInput,
} from "../../../src/core/webhook/payload";

const base: WebhookPayloadInput = {
  deliveryId: "d-1",
  event: "booking.created",
  occurredAt: Temporal.Instant.from("2026-07-22T16:00:00Z"),
  booking: {
    bookingId: "b-1",
    eventType: { id: "et-1", slug: "intro-call", title: "Intro call" },
    start: Temporal.Instant.from("2026-07-23T20:30:00Z"),
    end: Temporal.Instant.from("2026-07-23T21:00:00Z"),
    status: "confirmed",
    invitee: { email: "i@example.test", name: "Invitee", timezone: "America/New_York" },
    hosts: [{ id: "h-1", name: "Host", email: "h@example.test" }],
  },
};

describe("matchesSubscription", () => {
  test("matches by name and by wildcard, rejects others", () => {
    expect(matchesSubscription(["booking.created"], "booking.created")).toBe(true);
    expect(matchesSubscription(["*"], "booking.cancelled")).toBe(true);
    expect(matchesSubscription(["booking.created"], "booking.cancelled")).toBe(false);
    expect(matchesSubscription([], "booking.created")).toBe(false);
  });
});

describe("buildWebhookBody", () => {
  test("renders both UTC and invitee-zone times (DST-aware)", () => {
    const body = JSON.parse(buildWebhookBody(base)) as {
      data: { booking: { start: { utc: string; invitee: string } } };
    };
    expect(body.data.booking.start.utc).toBe("2026-07-23T20:30:00Z");
    // July in New York is EDT (-04:00)
    expect(body.data.booking.start.invitee).toBe("2026-07-23T16:30:00-04:00[America/New_York]");
  });

  test("is deterministic: same input, same bytes", () => {
    expect(buildWebhookBody(base)).toBe(buildWebhookBody(base));
  });

  test("includes reason only when present", () => {
    expect(buildWebhookBody(base)).not.toContain("reason");
    const cancelled = buildWebhookBody({
      ...base,
      event: "booking.cancelled",
      booking: { ...base.booking, status: "cancelled", reason: "ran out of time" },
    });
    const parsed = JSON.parse(cancelled) as { data: { booking: { reason: string; status: string } } };
    expect(parsed.data.booking.reason).toBe("ran out of time");
    expect(parsed.data.booking.status).toBe("cancelled");
  });

  test("carries deliveryId, event, and occurredAt at the top level", () => {
    const parsed = JSON.parse(buildWebhookBody(base)) as Record<string, unknown>;
    expect(parsed.deliveryId).toBe("d-1");
    expect(parsed.event).toBe("booking.created");
    expect(parsed.occurredAt).toBe("2026-07-22T16:00:00Z");
  });
});

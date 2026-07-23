import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  createSuggestionRoutes,
  type SuggestionDeps,
} from "../../src/api/routes/suggestions";

const NOW = Temporal.Instant.from("2026-07-22T12:00:00Z");
const validBody = {
  invitee: { email: "ivy@example.com", name: "Ivy", timezone: "America/Los_Angeles" },
  proposedSlots: [{ start: "2026-07-23T17:00:00Z", end: "2026-07-23T17:30:00Z" }],
  message: "  Tuesday works  ",
};

function makeDeps(overrides: Partial<SuggestionDeps> = {}): SuggestionDeps {
  return {
    getEventTypeBySlug: async () => ({ id: "event-1", slug: "chat", title: "Chat" }),
    createSuggestion: async () => "suggestion-1",
    now: () => NOW,
    checkRateLimit: async () => ({ allowed: true, remaining: 4, retryAfterSeconds: 0 }),
    ...overrides,
  };
}

async function post(deps: SuggestionDeps, body: unknown, slug = "chat") {
  return createSuggestionRoutes(deps).request(`/event-types/${slug}/suggestions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /event-types/:slug/suggestions", () => {
  test("stores normalized input and enqueues email and webhook", async () => {
    let stored: unknown;
    const queued: string[] = [];
    const response = await post(makeDeps({
      createSuggestion: async (eventTypeId, input) => {
        stored = { eventTypeId, ...input };
        return "suggestion-1";
      },
      enqueueEmail: async (id) => { queued.push(`email:${id}`); },
      emitWebhook: async (id) => { queued.push(`webhook:${id}`); },
    }), validBody);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ suggestionId: "suggestion-1" });
    expect(stored).toMatchObject({
      eventTypeId: "event-1",
      message: "Tuesday works",
      proposedSlots: [{ start: "2026-07-23T17:00:00Z", end: "2026-07-23T17:30:00Z" }],
    });
    expect(queued.sort()).toEqual(["email:suggestion-1", "webhook:suggestion-1"]);
  });

  test("returns 404 for an unknown event type", async () => {
    const response = await post(makeDeps({ getEventTypeBySlug: async () => null }), validBody);
    expect(response.status).toBe(404);
  });

  test.each([
    [{ ...validBody, invitee: { ...validBody.invitee, email: "bad" } }, "email"],
    [{ ...validBody, invitee: { ...validBody.invitee, timezone: "Mars/Olympus" } }, "timezone"],
    [{ ...validBody, proposedSlots: [] }, "empty slots"],
    [{ ...validBody, proposedSlots: [{ start: "2026-07-23T18:00:00Z", end: "2026-07-23T17:00:00Z" }] }, "reversed"],
    [{ ...validBody, proposedSlots: [{ start: "2026-07-21T18:00:00Z", end: "2026-07-21T19:00:00Z" }] }, "past"],
  ])("rejects invalid %s", async (body) => {
    expect((await post(makeDeps(), body)).status).toBe(400);
  });

  test("applies the suggestion-specific rate limit", async () => {
    const response = await post(makeDeps({
      checkRateLimit: async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 42 }),
    }), validBody);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited", retryAfterSeconds: 42 });
  });
});

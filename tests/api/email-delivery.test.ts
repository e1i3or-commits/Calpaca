import { describe, expect, test } from "bun:test";
import { createEmailDeliveryRoutes, type EmailDeliveryDeps } from "../../src/api/routes/webhooks";
import { ok, err } from "../../src/lib/result";
import type { BookingStateError } from "../../src/core/booking/state";

/** POST /api/webhooks/email-delivery — the normalized inbound feedback
 * endpoint (an n8n flow translates provider bounce/delivery notifications
 * into this shape). Same deps-injection convention as webhook-admin. */

const BOOKING_ID = "7b0f8a4e-1111-2222-3333-444455556666";
const SECRET = "delivery-secret";

type AppendCall = {
  bookingId: string;
  kind: "invite_delivered" | "invite_failed";
  payload: { reason?: string };
};

function makeDeps(overrides: Partial<EmailDeliveryDeps> = {}) {
  const calls: AppendCall[] = [];
  const deps: EmailDeliveryDeps = {
    appendInviteEvent: async (bookingId, kind, payload) => {
      calls.push({ bookingId, kind, payload });
      return ok({});
    },
    secret: () => SECRET,
    ...overrides,
  };
  return { deps, calls };
}

function post(routes: ReturnType<typeof createEmailDeliveryRoutes>, body: unknown, token = SECRET) {
  return routes.request("/api/webhooks/email-delivery", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/email-delivery", () => {
  test("404 when no secret is configured — feature off", async () => {
    const { deps } = makeDeps({ secret: () => undefined });
    const res = await post(createEmailDeliveryRoutes(deps), {
      bookingId: BOOKING_ID,
      status: "delivered",
    });
    expect(res.status).toBe(404);
  });

  test("401 on a wrong or missing bearer", async () => {
    const { deps, calls } = makeDeps();
    const routes = createEmailDeliveryRoutes(deps);

    const wrong = await post(routes, { bookingId: BOOKING_ID, status: "delivered" }, "nope");
    expect(wrong.status).toBe(401);

    const missing = await routes.request("/api/webhooks/email-delivery", {
      method: "POST",
      body: JSON.stringify({ bookingId: BOOKING_ID, status: "delivered" }),
    });
    expect(missing.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test("400 on an invalid body", async () => {
    const { deps, calls } = makeDeps();
    const routes = createEmailDeliveryRoutes(deps);

    expect((await post(routes, { bookingId: "not-a-uuid", status: "delivered" })).status).toBe(400);
    expect((await post(routes, { bookingId: BOOKING_ID, status: "opened" })).status).toBe(400);
    expect((await post(routes, "not json at all")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("delivered appends invite_delivered", async () => {
    const { deps, calls } = makeDeps();
    const res = await post(createEmailDeliveryRoutes(deps), {
      bookingId: BOOKING_ID,
      status: "delivered",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: true });
    expect(calls).toEqual([{ bookingId: BOOKING_ID, kind: "invite_delivered", payload: {} }]);
  });

  test("bounced appends invite_failed with the given reason, defaulting to 'bounced'", async () => {
    const { deps, calls } = makeDeps();
    const routes = createEmailDeliveryRoutes(deps);

    await post(routes, { bookingId: BOOKING_ID, status: "bounced", reason: "mailbox full" });
    await post(routes, { bookingId: BOOKING_ID, status: "bounced" });

    expect(calls).toEqual([
      { bookingId: BOOKING_ID, kind: "invite_failed", payload: { reason: "mailbox full" } },
      { bookingId: BOOKING_ID, kind: "invite_failed", payload: { reason: "bounced" } },
    ]);
  });

  test("404 for an unknown booking", async () => {
    const notCreated: BookingStateError = { kind: "invite_delivered", reason: "not_created" };
    const { deps } = makeDeps({ appendInviteEvent: async () => err(notCreated) });
    const res = await post(createEmailDeliveryRoutes(deps), {
      bookingId: BOOKING_ID,
      status: "delivered",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown_booking" });
  });

  test("illegal transitions are acknowledged, not recorded — sender must not retry", async () => {
    const dup: BookingStateError = { kind: "invite_delivered", reason: "invite_not_sent" };
    const { deps } = makeDeps({ appendInviteEvent: async () => err(dup) });
    const res = await post(createEmailDeliveryRoutes(deps), {
      bookingId: BOOKING_ID,
      status: "delivered",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: false, reason: "invite_not_sent" });
  });
});

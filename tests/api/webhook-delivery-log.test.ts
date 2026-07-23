import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createEmailDeliveryRoutes } from "../../src/api/routes/webhooks";
import { createWebhookAdminRoutes, type WebhookAdminDeps } from "../../src/api/routes/webhook-admin";
import {
  deliverWebhook,
  fanOutBookingWebhooks,
  type DeliveryDeps,
  type DeliveryJob,
  type FanOutDeps,
} from "../../src/jobs/webhook-delivery";
import type { WebhookDeliveryRow, WebhookRow } from "../../src/db/webhook-repo";
import {
  createWebhook,
  createWebhookDelivery,
  listWebhookDeliveries,
  recordWebhookDeliveryAttempt,
} from "../../src/db/webhook-repo";
import { ok } from "../../src/lib/result";
import * as schema from "../../src/db/schema";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Temporal.Instant.from("2027-01-04T08:00:00Z");

const subscribed: WebhookRow = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://subscribed.example.test/hook",
  events: ["booking.invite_delivered"],
  secret: "whsec_subscribed",
  active: true,
};

const other: WebhookRow = {
  id: "33333333-3333-4333-8333-333333333333",
  url: "https://other.example.test/hook",
  events: ["booking.created"],
  secret: "whsec_other",
  active: true,
};

function fanOutDeps(pending: { id: string; webhookId: string; event: string }[]): FanOutDeps {
  return {
    listActiveWebhooks: async () => [subscribed, other],
    getInviteContext: async () => ({
      booking: {
        id: BOOKING_ID,
        eventTypeId: "event-type-1",
        startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
        endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
        inviteeEmail: "invitee@example.test",
        inviteeName: "Invitee",
        inviteeTimezone: "UTC",
        hostUserIds: ["host-1"],
        status: "confirmed",
        rescheduleToken: "reschedule-token",
        cancelToken: "cancel-token",
      },
      eventTypeTitle: "Intro",
      eventTypeSlug: "intro",
      hosts: [{ id: "host-1", name: "Host", email: "host@example.test", timezone: "UTC" }],
      rescheduleCount: 0,
    }),
    createWebhookDelivery: async (input) => {
      pending.push(input);
    },
    now: () => NOW,
    deliveryId: () => "44444444-4444-4444-8444-444444444444",
  };
}

function deliveryJob(): DeliveryJob {
  return {
    webhookId: subscribed.id,
    deliveryId: "44444444-4444-4444-8444-444444444444",
    event: "booking.invite_delivered",
    body: "{}",
  };
}

describe("webhook delivery log", () => {
  test("invite_delivered append fans out only to subscribers and creates pending log", async () => {
    const pending: { id: string; webhookId: string; event: string }[] = [];
    const routes = createEmailDeliveryRoutes({
      secret: () => "feedback-secret",
      appendInviteEvent: async () => ok({}),
      emitBookingWebhook: async (bookingId, kind) => {
        expect(bookingId).toBe(BOOKING_ID);
        expect(kind).toBe("invite_delivered");
        const jobs = await fanOutBookingWebhooks(bookingId, kind, undefined, fanOutDeps(pending));
        expect(jobs.map((job) => job.webhookId)).toEqual([subscribed.id]);
      },
    });

    const response = await routes.request("/api/webhooks/email-delivery", {
      method: "POST",
      headers: {
        authorization: "Bearer feedback-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ bookingId: BOOKING_ID, status: "delivered" }),
    });

    expect(response.status).toBe(200);
    expect(pending).toEqual([
      {
        id: "44444444-4444-4444-8444-444444444444",
        webhookId: subscribed.id,
        event: "booking.invite_delivered",
      },
    ]);
  });

  test("successful delivery records delivered with one attempt", async () => {
    const outcomes: unknown[] = [];
    const deps: DeliveryDeps = {
      getWebhook: async () => subscribed,
      recordAttempt: async (_id, outcome) => {
        outcomes.push(outcome);
      },
      fetch: async () => new Response(null, { status: 204 }),
      nowMs: () => 1_800_000_000_000,
    };

    await deliverWebhook(deliveryJob(), { retryCount: 0, retryLimit: 8 }, deps);

    expect(outcomes).toEqual([
      { delivered: true, exhausted: false, httpStatus: 204 },
    ]);
  });

  test("non-2xx records status and remains pending before retries exhaust", async () => {
    const outcomes: unknown[] = [];
    const deps: DeliveryDeps = {
      getWebhook: async () => subscribed,
      recordAttempt: async (_id, outcome) => {
        outcomes.push(outcome);
      },
      fetch: async () => new Response(null, { status: 503 }),
      nowMs: () => 1_800_000_000_000,
    };

    await expect(
      deliverWebhook(deliveryJob(), { retryCount: 2, retryLimit: 8 }, deps),
    ).rejects.toThrow("HTTP 503");
    expect(outcomes).toEqual([
      {
        delivered: false,
        exhausted: false,
        httpStatus: 503,
        error: "HTTP 503",
      },
    ]);
  });

  test("admin listing is scoped to the requested endpoint", async () => {
    const row: WebhookDeliveryRow = {
      id: "44444444-4444-4444-8444-444444444444",
      webhookId: subscribed.id,
      event: "booking.invite_delivered",
      status: "delivered",
      attempts: 1,
      lastHttpStatus: 204,
      lastError: null,
      createdAt: new Date("2027-01-04T08:00:00Z"),
      completedAt: new Date("2027-01-04T08:00:01Z"),
    };
    const requested: { id: string; limit: number }[] = [];
    const deps: WebhookAdminDeps = {
      requireAuth: async (c, next) => {
        c.set("user", { id: "user-1", email: "host@example.test", name: "Host" });
        await next();
      },
      listWebhooks: async () => [subscribed, other],
      createWebhook: async () => subscribed,
      setWebhookActive: async () => subscribed,
      deleteWebhook: async () => true,
      listWebhookDeliveries: async (id, limit) => {
        requested.push({ id, limit });
        return id === subscribed.id ? [row] : [];
      },
    };
    const router = createWebhookAdminRoutes(deps);

    const response = await router.request(
      `/api/me/webhooks/${subscribed.id}/deliveries?limit=12`,
    );
    expect(response.status).toBe(200);
    expect(requested).toEqual([{ id: subscribed.id, limit: 12 }]);
    const body = (await response.json()) as { deliveries: { webhookId: string }[] };
    expect(body.deliveries.map((delivery) => delivery.webhookId)).toEqual([subscribed.id]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("webhook delivery log persistence", () => {
  test("attempt updates are durable and listings stay endpoint-scoped", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });

    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(
        sql`truncate table ${schema.webhookDeliveries}, ${schema.webhooks} restart identity cascade`,
      );
      const hookA = await createWebhook(
        { url: "https://a.example.test/hook", events: ["booking.invite_delivered"] },
        db,
      );
      const hookB = await createWebhook(
        { url: "https://b.example.test/hook", events: ["booking.invite_delivered"] },
        db,
      );
      const deliveryA = "55555555-5555-4555-8555-555555555555";
      const deliveryB = "66666666-6666-4666-8666-666666666666";

      await createWebhookDelivery(
        { id: deliveryA, webhookId: hookA.id, event: "booking.invite_delivered" },
        db,
      );
      await createWebhookDelivery(
        { id: deliveryB, webhookId: hookB.id, event: "booking.invite_delivered" },
        db,
      );
      await recordWebhookDeliveryAttempt(
        deliveryA,
        {
          delivered: false,
          exhausted: false,
          httpStatus: 503,
          error: "HTTP 503",
        },
        db,
      );

      const [pending] = await listWebhookDeliveries(hookA.id, 50, db);
      expect(pending).toMatchObject({
        id: deliveryA,
        status: "pending",
        attempts: 1,
        lastHttpStatus: 503,
        lastError: "HTTP 503",
        completedAt: null,
      });

      await recordWebhookDeliveryAttempt(
        deliveryA,
        { delivered: true, exhausted: false, httpStatus: 204 },
        db,
      );
      const rowsA = await listWebhookDeliveries(hookA.id, 50, db);
      const rowsB = await listWebhookDeliveries(hookB.id, 50, db);
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]).toMatchObject({
        id: deliveryA,
        status: "delivered",
        attempts: 2,
        lastHttpStatus: 204,
        lastError: null,
      });
      expect(rowsA[0]?.completedAt).toBeInstanceOf(Date);
      expect(rowsB.map((row) => row.id)).toEqual([deliveryB]);
    } finally {
      await pool.end();
    }
  });
});

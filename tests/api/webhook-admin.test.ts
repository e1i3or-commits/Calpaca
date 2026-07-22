import { describe, expect, test } from "bun:test";
import { createWebhookAdminRoutes, type WebhookAdminDeps } from "../../src/api/routes/webhook-admin";
import type { WebhookRow } from "../../src/db/webhook-repo";

const row: WebhookRow = {
  id: "wh-1",
  url: "https://n8n.example.test/hook",
  events: ["*"],
  secret: "whsec_secret-value",
  active: true,
};

function makeDeps(overrides: Partial<WebhookAdminDeps> = {}): WebhookAdminDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: "u-1", email: "host@example.test", name: "Host" });
      await next();
    },
    listWebhooks: async () => [row],
    createWebhook: async (input) => ({ ...row, ...input }),
    setWebhookActive: async (id, active) => (id === "wh-1" ? { ...row, active } : null),
    deleteWebhook: async (id) => id === "wh-1",
    ...overrides,
  };
}

describe("webhook admin routes", () => {
  test("requires a session", async () => {
    const router = createWebhookAdminRoutes(
      makeDeps({ requireAuth: async (c) => c.json({ error: "unauthorized" }, 401) }),
    );
    expect((await router.request("/api/me/webhooks")).status).toBe(401);
    expect((await router.request("/api/me/webhooks/wh-1", { method: "DELETE" })).status).toBe(401);
  });

  test("list redacts the secret", async () => {
    const router = createWebhookAdminRoutes(makeDeps());
    const res = await router.request("/api/me/webhooks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhooks: Record<string, unknown>[] };
    expect(body.webhooks).toHaveLength(1);
    expect(body.webhooks[0]!.url).toBe("https://n8n.example.test/hook");
    expect(body.webhooks[0]!.secret).toBeUndefined();
  });

  test("create returns the secret exactly once and validates input", async () => {
    const router = createWebhookAdminRoutes(makeDeps());
    const res = await router.request("/api/me/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://n8n.example.test/hook", events: ["booking.created"] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { secret: string; events: string[] };
    expect(body.secret).toStartWith("whsec_");
    expect(body.events).toEqual(["booking.created"]);

    const bad = await router.request("/api/me/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "ftp://nope", events: ["booking.created"] }),
    });
    expect(bad.status).toBe(400);
    const unknownEvent = await router.request("/api/me/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://ok.example.test", events: ["booking.exploded"] }),
    });
    expect(unknownEvent.status).toBe(400);
  });

  test("patch toggles active; delete returns 404 for unknown ids", async () => {
    const router = createWebhookAdminRoutes(makeDeps());
    const res = await router.request("/api/me/webhooks/wh-1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { active: boolean }).active).toBe(false);

    expect(
      (await router.request("/api/me/webhooks/missing", { method: "DELETE" })).status,
    ).toBe(404);
    expect((await router.request("/api/me/webhooks/wh-1", { method: "DELETE" })).status).toBe(200);
  });
});

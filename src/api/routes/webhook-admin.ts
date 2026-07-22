import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { WEBHOOK_EVENT_KINDS } from "../../core/webhook/payload";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  setWebhookActive,
  type WebhookRow,
} from "../../db/webhook-repo";

/** Outbound-webhook management (the n8n extension boundary). Same injection
 * convention as the booking routes so tests stub the repo and the session. */
export interface WebhookAdminDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly listWebhooks: () => Promise<WebhookRow[]>;
  readonly createWebhook: (input: { url: string; events: string[] }) => Promise<WebhookRow>;
  readonly setWebhookActive: (id: string, active: boolean) => Promise<WebhookRow | null>;
  readonly deleteWebhook: (id: string) => Promise<boolean>;
}

const defaultDeps: WebhookAdminDeps = {
  requireAuth: requireSession,
  listWebhooks: () => listWebhooks(),
  createWebhook: (input) => createWebhook(input),
  setWebhookActive: (id, active) => setWebhookActive(id, active),
  deleteWebhook: (id) => deleteWebhook(id),
};

const createBodySchema = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), "must be http(s)"),
  events: z.array(z.enum(["*", ...WEBHOOK_EVENT_KINDS])).nonempty(),
});

const patchBodySchema = z.object({ active: z.boolean() });

/** The secret appears exactly once, in the create response. */
function redact(row: WebhookRow): Omit<WebhookRow, "secret"> {
  return { id: row.id, url: row.url, events: row.events, active: row.active };
}

export function createWebhookAdminRoutes(deps: WebhookAdminDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.use("/api/me/webhooks/*", deps.requireAuth);
  router.use("/api/me/webhooks", deps.requireAuth);

  router.get("/api/me/webhooks", async (c) => {
    const rows = await deps.listWebhooks();
    return c.json({ webhooks: rows.map(redact) });
  });

  router.post("/api/me/webhooks", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

    const row = await deps.createWebhook(parsed.data);
    return c.json(row, 201); // includes the secret — the only time it does
  });

  router.patch("/api/me/webhooks/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

    const row = await deps.setWebhookActive(c.req.param("id"), parsed.data.active);
    if (!row) return c.json({ error: "webhook_not_found" }, 404);
    return c.json(redact(row));
  });

  router.delete("/api/me/webhooks/:id", async (c) => {
    const deleted = await deps.deleteWebhook(c.req.param("id"));
    if (!deleted) return c.json({ error: "webhook_not_found" }, 404);
    return c.json({ ok: true });
  });

  return router;
}

export const webhookAdminRoutes = createWebhookAdminRoutes();

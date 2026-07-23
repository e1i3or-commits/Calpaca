import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { WEBHOOK_EVENT_KINDS } from "../../core/webhook/payload";
import {
  createWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  listWebhooks,
  setWebhookActive,
  type WebhookRow,
  type WebhookDeliveryRow,
} from "../../db/webhook-repo";

/** Outbound-webhook management (the n8n extension boundary). Same injection
 * convention as the booking routes so tests stub the repo and the session. */
export interface WebhookAdminDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly listWebhooks: (workspaceId?: string) => Promise<WebhookRow[]>;
  readonly createWebhook: (
    input: { url: string; events: string[] },
    workspaceId?: string,
  ) => Promise<WebhookRow>;
  readonly setWebhookActive: (id: string, active: boolean, workspaceId?: string) => Promise<WebhookRow | null>;
  readonly deleteWebhook: (id: string, workspaceId?: string) => Promise<boolean>;
  readonly listWebhookDeliveries?: (
    id: string,
    limit: number,
    workspaceId?: string,
  ) => Promise<WebhookDeliveryRow[]>;
}

const defaultDeps: WebhookAdminDeps = {
  requireAuth: requireSession,
  listWebhooks: (workspaceId) => listWebhooks(undefined, workspaceId),
  createWebhook: (input, workspaceId) => createWebhook(input, undefined, workspaceId),
  setWebhookActive: (id, active, workspaceId) =>
    setWebhookActive(id, active, undefined, workspaceId),
  deleteWebhook: (id, workspaceId) => deleteWebhook(id, undefined, workspaceId),
  listWebhookDeliveries: (id, limit, workspaceId) =>
    listWebhookDeliveries(id, limit, undefined, workspaceId),
};

const createBodySchema = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), "must be http(s)"),
  events: z.array(z.enum(["*", ...WEBHOOK_EVENT_KINDS])).nonempty(),
});

const patchBodySchema = z.object({ active: z.boolean() });
const deliveryQuerySchema = z.coerce.number().int().min(1).max(200).default(50);

/** The secret appears exactly once, in the create response. */
function redact(row: WebhookRow): Omit<WebhookRow, "secret"> {
  return { id: row.id, url: row.url, events: row.events, active: row.active };
}

export function createWebhookAdminRoutes(deps: WebhookAdminDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.use("/api/me/webhooks/*", deps.requireAuth);
  router.use("/api/me/webhooks", deps.requireAuth);

  router.get("/api/me/webhooks", async (c) => {
    const rows = await deps.listWebhooks(c.get("user").workspaceId);
    return c.json({ webhooks: rows.map(redact) });
  });

  router.post("/api/me/webhooks", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

    const row = await deps.createWebhook(parsed.data, c.get("user").workspaceId);
    return c.json(row, 201); // includes the secret — the only time it does
  });

  router.get("/api/me/webhooks/:id/deliveries", async (c) => {
    const parsed = deliveryQuerySchema.safeParse(c.req.query("limit"));
    if (!parsed.success) return c.json({ error: "invalid_limit" }, 400);
    const rows = await deps.listWebhookDeliveries?.(
      c.req.param("id"),
      parsed.data,
      c.get("user").workspaceId,
    );
    return c.json({ deliveries: rows ?? [] });
  });

  router.patch("/api/me/webhooks/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

    const row = await deps.setWebhookActive(
      c.req.param("id"),
      parsed.data.active,
      c.get("user").workspaceId,
    );
    if (!row) return c.json({ error: "webhook_not_found" }, 404);
    return c.json(redact(row));
  });

  router.delete("/api/me/webhooks/:id", async (c) => {
    const deleted = await deps.deleteWebhook(
      c.req.param("id"),
      c.get("user").workspaceId,
    );
    if (!deleted) return c.json({ error: "webhook_not_found" }, 404);
    return c.json({ ok: true });
  });

  return router;
}

export const webhookAdminRoutes = createWebhookAdminRoutes();

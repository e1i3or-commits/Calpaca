import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { playbookStatuses } from "../../core/engagement/playbook";
import {
  attachConversationPlaybook,
  createConversationPlaybook,
  getConversationPlaybook,
  listEngagementConversations,
  listConversationSchedulingOptions,
  listWorkspacePlaybooks,
  updateConversationPlaybook,
} from "../../db/conversation-repo";

export interface ConversationDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly list: typeof listEngagementConversations;
  readonly get: typeof getConversationPlaybook;
  readonly templates: typeof listWorkspacePlaybooks;
  readonly schedulingOptions: typeof listConversationSchedulingOptions;
  readonly attach: typeof attachConversationPlaybook;
  readonly create: typeof createConversationPlaybook;
  readonly update: typeof updateConversationPlaybook;
}

const defaultDeps: ConversationDeps = {
  requireAuth: requireSession,
  list: listEngagementConversations,
  get: getConversationPlaybook,
  templates: listWorkspacePlaybooks,
  schedulingOptions: listConversationSchedulingOptions,
  attach: attachConversationPlaybook,
  create: createConversationPlaybook,
  update: updateConversationPlaybook,
};

const playbookSchema = z.object({
  title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().max(1000).nullable(),
  clientExplanation: z.string().trim().max(2000).nullable(),
  durationMinutes: z.number().int().min(5).max(720),
  selectableDurations: z.array(z.number().int().min(5).max(720)).max(12),
  participantRoles: z.array(z.object({
    role: z.string().trim().min(1).max(80),
    required: z.boolean(),
  })).max(20),
  preparationItems: z.array(z.object({
    label: z.string().trim().min(1).max(240),
    required: z.boolean(),
  })).max(30),
  outcomeDefinition: z.string().trim().max(2000).nullable(),
  status: z.enum(playbookStatuses),
});

function context(c: { get: (key: "user") => AuthEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user.workspaceId || !user.workspaceRole) return null;
  return {
    workspaceId: user.workspaceId,
    actor: { userId: user.id, workspaceRole: user.workspaceRole },
  };
}

export function createConversationRoutes(deps: ConversationDeps = defaultDeps) {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/engagements/:engagementId/conversations", deps.requireAuth);
  router.use("/api/me/engagements/:engagementId/conversations/*", deps.requireAuth);

  router.get("/api/me/engagements/:engagementId/conversations", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const conversations = await deps.list(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
    );
    return conversations
      ? c.json({ conversations })
      : c.json({ error: "engagement_not_found" }, 404);
  });

  router.get("/api/me/engagements/:engagementId/conversations/templates", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const templates = await deps.templates(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
    );
    return templates
      ? c.json({ templates })
      : c.json({ error: "engagement_not_found" }, 404);
  });

  router.get("/api/me/engagements/:engagementId/conversations/scheduling-options", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const schedules = await deps.schedulingOptions(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
    );
    return schedules
      ? c.json({ schedules })
      : c.json({ error: "engagement_not_found" }, 404);
  });

  router.post("/api/me/engagements/:engagementId/conversations/:eventTypeId/attach", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.attach(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
      c.req.param("eventTypeId"),
    );
    if (result === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (result === "engagement_not_found") {
      return c.json({ error: "engagement_not_found" }, 404);
    }
    if (result === "playbook_not_found") {
      return c.json({ error: "playbook_not_found" }, 404);
    }
    if (result === "playbook_not_available") {
      return c.json({ error: "playbook_not_available" }, 409);
    }
    return c.json({ ok: true });
  });

  router.post("/api/me/engagements/:engagementId/conversations", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = playbookSchema.extend({
      hostUserId: z.string().uuid(),
      scheduleId: z.string().uuid().nullable(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({
        error: "invalid_body",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      }, 400);
    }
    const result = await deps.create(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
      parsed.data,
    );
    if (result.kind === "engagement_not_found") {
      return c.json({ error: "engagement_not_found" }, 404);
    }
    if (result.kind === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (result.kind === "invalid_host") return c.json({ error: "invalid_host" }, 400);
    if (result.kind === "invalid_schedule") {
      return c.json({ error: "invalid_schedule" }, 400);
    }
    if (result.kind === "not_ready") {
      return c.json({ error: "playbook_not_ready", issues: result.issues }, 409);
    }
    return c.json({ playbook: result.playbook }, 201);
  });

  router.get("/api/me/engagements/:engagementId/conversations/:eventTypeId", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.get(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
      c.req.param("eventTypeId"),
    );
    return result
      ? c.json(result)
      : c.json({ error: "playbook_not_found" }, 404);
  });

  router.patch("/api/me/engagements/:engagementId/conversations/:eventTypeId", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = playbookSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({
        error: "invalid_body",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      }, 400);
    }
    const result = await deps.update(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
      c.req.param("eventTypeId"),
      parsed.data,
    );
    if (result.kind === "not_found") return c.json({ error: "playbook_not_found" }, 404);
    if (result.kind === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (result.kind === "not_ready") {
      return c.json({ error: "playbook_not_ready", issues: result.issues }, 409);
    }
    return c.json({ playbook: result.playbook });
  });

  return router;
}

export const conversationRoutes = createConversationRoutes();

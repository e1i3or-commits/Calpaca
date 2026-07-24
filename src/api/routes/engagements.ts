import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  createEngagement,
  findSimilarClients,
  getEngagement,
  listEngagements,
  updateEngagementStatus,
  type EngagementCreateInput,
} from "../../db/engagement-repo";
import {
  engagementStatuses,
  engagementTypes,
} from "../../core/engagement/model";

type Actor = {
  userId: string;
  workspaceRole: "owner" | "admin" | "member";
};

export interface EngagementDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly list: typeof listEngagements;
  readonly get: typeof getEngagement;
  readonly create: typeof createEngagement;
  readonly similarClients: typeof findSimilarClients;
  readonly updateStatus: typeof updateEngagementStatus;
}

const defaultDeps: EngagementDeps = {
  requireAuth: requireSession,
  list: listEngagements,
  get: getEngagement,
  create: createEngagement,
  similarClients: findSimilarClients,
  updateStatus: updateEngagementStatus,
};

const createSchema = z.object({
  clientName: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  type: z.enum(engagementTypes),
  status: z.enum(["draft", "potential", "active"]),
  visibility: z.enum(["workspace", "restricted"]),
  accountLeadUserId: z.string().uuid(),
  expectedEndDate: z.string().date().nullish(),
  people: z.array(z.object({
    userId: z.string().uuid(),
    role: z.string().trim().min(1).max(80),
  })).max(50).optional(),
});

function context(c: { get: (key: "user") => AuthEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user.workspaceId || !user.workspaceRole) return null;
  return {
    workspaceId: user.workspaceId,
    actor: { userId: user.id, workspaceRole: user.workspaceRole } satisfies Actor,
  };
}

export function createEngagementRoutes(deps: EngagementDeps = defaultDeps) {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/engagements", deps.requireAuth);
  router.use("/api/me/engagements/*", deps.requireAuth);

  router.get("/api/me/engagements", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = z.object({
      search: z.string().max(160).optional(),
      status: z.enum(engagementStatuses).optional(),
    }).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid_query" }, 400);
    const engagements = await deps.list(
      current.workspaceId,
      current.actor,
      parsed.data,
    );
    return c.json({
      engagements: engagements.map((engagement) => ({
        ...engagement,
        updatedAt: engagement.updatedAt.toISOString(),
      })),
    });
  });

  router.get("/api/me/engagements/clients/similar", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = z.object({ name: z.string().trim().min(2).max(160) })
      .safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid_query" }, 400);
    return c.json({
      clients: await deps.similarClients(current.workspaceId, parsed.data.name),
    });
  });

  router.post("/api/me/engagements", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({
        error: "invalid_body",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      }, 400);
    }
    try {
      const result = await deps.create(
        current.workspaceId,
        current.actor,
        parsed.data as EngagementCreateInput,
      );
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_engagement_person") {
        return c.json({ error: "invalid_engagement_person" }, 400);
      }
      throw error;
    }
  });

  router.get("/api/me/engagements/:id", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const engagement = await deps.get(
      current.workspaceId,
      current.actor,
      c.req.param("id"),
    );
    if (!engagement) return c.json({ error: "engagement_not_found" }, 404);
    return c.json({
      engagement: {
        ...engagement,
        createdAt: engagement.createdAt.toISOString(),
        updatedAt: engagement.updatedAt.toISOString(),
        meetings: engagement.meetings.map((meeting) => ({
          ...meeting,
          startsAt: meeting.startsAt.toISOString(),
        })),
      },
    });
  });

  router.patch("/api/me/engagements/:id/status", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = z.object({ status: z.enum(engagementStatuses) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const result = await deps.updateStatus(
      current.workspaceId,
      current.actor,
      c.req.param("id"),
      parsed.data.status,
    );
    if (result.kind === "not_found") {
      return c.json({ error: "engagement_not_found" }, 404);
    }
    if (result.kind === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (result.kind === "invalid_transition") {
      return c.json({ error: "invalid_transition" }, 409);
    }
    return c.json({ engagement: result.engagement });
  });

  return router;
}

export const engagementRoutes = createEngagementRoutes();

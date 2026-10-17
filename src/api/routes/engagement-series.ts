import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { getEngagementSeries, listEngagementSeries } from "../../db/engagement-series-repo";
import { removeEngagementPerson, setEngagementPerson } from "../../db/engagement-repo";
import { engagementStatuses } from "../../core/engagement/model";

/**
 * Engagements as meeting series, for dashboards outside Calpaca (Tyger) and
 * the organizer API. Read-only except the Engagement team; meeting changes go
 * through the reviewed follow-up schedule (`/followup-schedule/preview` and
 * `/apply`, including `skip`), so calendar and email effects stay identical.
 * Session or personal API token; visibility and management are the
 * Engagement's own (account lead, assigned people, workspace admins).
 */

export interface EngagementSeriesDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly list: typeof listEngagementSeries;
  readonly get: typeof getEngagementSeries;
  readonly setPerson: typeof setEngagementPerson;
  readonly removePerson: typeof removeEngagementPerson;
}

const defaults: EngagementSeriesDeps = {
  requireAuth: requireSession,
  list: listEngagementSeries,
  get: getEngagementSeries,
  setPerson: setEngagementPerson,
  removePerson: removeEngagementPerson,
};

export const engagementPersonInput = z.object({
  role: z.string().trim().min(1).max(80),
}).strict();

const uuid = z.string().uuid();

/** Both meeting bounds or neither, at most 93 days apart (a quarter covers any calendar view). */
export const seriesListQuery = z.object({
  status: z.enum(engagementStatuses).optional(),
  meetingsFrom: z.string().datetime({ offset: true }).optional(),
  meetingsTo: z.string().datetime({ offset: true }).optional(),
}).strict().refine((q) => !q.meetingsFrom === !q.meetingsTo, { message: "meetingsFrom and meetingsTo go together" })
  .refine((q) => !q.meetingsFrom || !q.meetingsTo || (Date.parse(q.meetingsTo) > Date.parse(q.meetingsFrom) && Date.parse(q.meetingsTo) - Date.parse(q.meetingsFrom) <= 93 * 86400_000), { message: "at most 93 days" });

function context(c: { get: (key: "user") => AuthEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user.workspaceId || !user.workspaceRole) return null;
  return { workspaceId: user.workspaceId, actor: { userId: user.id, workspaceRole: user.workspaceRole } };
}

export function createEngagementSeriesRoutes(deps: EngagementSeriesDeps = defaults) {
  const router = new Hono<AuthEnv>();
  const noStore: MiddlewareHandler<AuthEnv> = async (c, next) => { c.header("Cache-Control", "no-store"); await next(); };
  for (const path of ["/api/me/engagement-series", "/api/me/engagement-series/*", "/api/me/engagements/:id/people/*"]) {
    router.use(path, noStore, deps.requireAuth);
  }

  router.get("/api/me/engagement-series", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = seriesListQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid_query" }, 400);
    const { status, meetingsFrom, meetingsTo } = parsed.data;
    const engagements = await deps.list(current.workspaceId, current.actor, {
      ...(status ? { status } : {}),
      ...(meetingsFrom && meetingsTo ? { meetings: { from: new Date(meetingsFrom), to: new Date(meetingsTo) } } : {}),
    });
    return c.json({ engagements });
  });

  router.get("/api/me/engagement-series/:id", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const id = c.req.param("id");
    if (!uuid.safeParse(id).success) return c.json({ error: "engagement_not_found" }, 404);
    const engagement = await deps.get(current.workspaceId, current.actor, id);
    if (!engagement) return c.json({ error: "engagement_not_found" }, 404);
    return c.json({ engagement });
  });

  router.put("/api/me/engagements/:id/people/:userId", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const { id, userId } = c.req.param();
    if (!uuid.safeParse(id).success) return c.json({ error: "engagement_not_found" }, 404);
    const body = engagementPersonInput.safeParse(await c.req.json().catch(() => null));
    if (!uuid.safeParse(userId).success || !body.success) return c.json({ error: "invalid_body" }, 400);
    const result = await deps.setPerson(current.workspaceId, current.actor, id, { userId, role: body.data.role });
    if (result.kind === "updated") return c.json({ people: result.people });
    if (result.kind === "not_found") return c.json({ error: "engagement_not_found" }, 404);
    if (result.kind === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (result.kind === "invalid_engagement_person") return c.json({ error: result.kind }, 400);
    return c.json({ error: result.kind }, 409);
  });

  router.delete("/api/me/engagements/:id/people/:userId", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const { id, userId } = c.req.param();
    if (!uuid.safeParse(id).success) return c.json({ error: "engagement_not_found" }, 404);
    if (!uuid.safeParse(userId).success) return c.json({ error: "invalid_body" }, 400);
    const result = await deps.removePerson(current.workspaceId, current.actor, id, userId);
    if (result.kind === "removed") return c.json({ people: result.people });
    if (result.kind === "not_found") return c.json({ error: "engagement_not_found" }, 404);
    if (result.kind === "forbidden") return c.json({ error: "forbidden" }, 403);
    if (result.kind === "person_not_found") return c.json({ error: result.kind }, 404);
    return c.json({ error: result.kind }, 409);
  });

  return router;
}

export const engagementSeriesRoutes = createEngagementSeriesRoutes();

import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { franchiseOnboardingInput, onboardingCadenceUpdate } from "../../core/engagement/franchise-onboarding";
import { provisionFranchiseOnboarding, getFranchiseOnboarding, updateOnboardingCadence } from "../../db/franchise-onboarding-repo";
import { prepareOnboardingKickoff } from "../../db/prepare-kickoff-repo";
export const prepareKickoffInput=z.object({}).strict();
export interface FranchiseOnboardingDeps {
  requireAuth: MiddlewareHandler<AuthEnv>;
  provision: typeof provisionFranchiseOnboarding;
  get: typeof getFranchiseOnboarding;
  updateCadence: typeof updateOnboardingCadence;
  prepareKickoff: typeof prepareOnboardingKickoff;
}
const defaults: FranchiseOnboardingDeps = { requireAuth: requireSession, provision: provisionFranchiseOnboarding, get: getFranchiseOnboarding, updateCadence: updateOnboardingCadence, prepareKickoff: prepareOnboardingKickoff };
export function createFranchiseOnboardingRoutes(deps: FranchiseOnboardingDeps = defaults) {
  const router = new Hono<AuthEnv>();
  for (const path of ["/api/automation/franchise-onboarding", "/api/automation/franchise-onboarding/*", "/api/me/engagements/:id/onboarding-cadence"]) {
    router.use(path, async (c, next) => { c.header("Cache-Control", "no-store"); await next(); }, deps.requireAuth);
  }
  const current = (user: AuthEnv["Variables"]["user"]) => user.workspaceId && user.workspaceRole
    ? { workspaceId: user.workspaceId, actor: { userId: user.id, workspaceRole: user.workspaceRole } } : null;
  router.post("/api/automation/franchise-onboarding/:engagementId/kickoff", async c => {
    const ctx=current(c.get("user")); if(!ctx)return c.json({error:"workspace_not_found"},404);
    if(!["owner","admin"].includes(ctx.actor.workspaceRole))return c.json({error:"forbidden"},403);
    if(!z.string().uuid().safeParse(c.req.param("engagementId")).success)return c.json({error:"invalid_input"},400);
    const body=await c.req.text();
    if(body && !prepareKickoffInput.safeParse((()=>{try{return JSON.parse(body);}catch{return null;}})()).success)return c.json({error:"invalid_input"},400);
    const result=await deps.prepareKickoff(ctx.workspaceId,ctx.actor,c.req.param("engagementId"));
    if(result.kind==="created" || result.kind==="reused")return c.json(result,result.kind==="created"?201:200);
    return c.json({error:result.kind},result.kind==="forbidden"?403:result.kind==="not_found"?404:409);
  });
  router.post("/api/automation/franchise-onboarding", async c => {
    const ctx = current(c.get("user")); if (!ctx) return c.json({ error: "workspace_not_found" }, 404);
    if (!["owner", "admin"].includes(ctx.actor.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    const parsed = franchiseOnboardingInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_input", fields: parsed.error.issues.map(issue => issue.path.join(".")) }, 400);
    const result = await deps.provision(ctx.workspaceId, ctx.actor, parsed.data);
    if (result.kind === "created" || result.kind === "reused") return c.json(result, result.kind === "created" ? 201 : 200);
    return c.json({ error: result.kind }, result.kind === "forbidden" ? 403 : 409);
  });
  router.get("/api/automation/franchise-onboarding/:sourceWorkspaceId/:projectKey", async c => {
    const ctx = current(c.get("user")); if (!ctx) return c.json({ error: "workspace_not_found" }, 404);
    if (!["owner", "admin"].includes(ctx.actor.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    if (!z.string().uuid().safeParse(c.req.param("sourceWorkspaceId")).success || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.req.param("projectKey"))) return c.json({ error: "invalid_source" }, 400);
    const result = await deps.get(ctx.workspaceId, ctx.actor, c.req.param("sourceWorkspaceId"), c.req.param("projectKey"));
    return result.kind === "found" ? c.json(result) : c.json({ error: result.kind }, result.kind === "forbidden" ? 403 : 404);
  });
  router.patch("/api/me/engagements/:id/onboarding-cadence", async c => {
    const ctx = current(c.get("user")); if (!ctx) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = onboardingCadenceUpdate.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !z.string().uuid().safeParse(c.req.param("id")).success) return c.json({ error: "invalid_input" }, 400);
    const result = await deps.updateCadence(ctx.workspaceId, ctx.actor, c.req.param("id"), parsed.data);
    if (result.kind === "updated" || result.kind === "unchanged") return c.json(result);
    return c.json({ error: result.kind }, result.kind === "forbidden" ? 403 : result.kind === "not_found" ? 404 : 409);
  });
  return router;
}
export const franchiseOnboardingRoutes = createFranchiseOnboardingRoutes();

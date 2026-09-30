import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { onboardingClientContactUpdate } from "../../core/engagement/franchise-onboarding";
import { updateOnboardingClientContact } from "../../db/onboarding-contact-repo";
export interface OnboardingContactDeps { requireAuth: MiddlewareHandler<AuthEnv>; update: typeof updateOnboardingClientContact }
const defaults: OnboardingContactDeps = { requireAuth: requireSession, update: updateOnboardingClientContact };
export function createOnboardingContactRoutes(deps: OnboardingContactDeps = defaults) {
  const router = new Hono<AuthEnv>(), path = "/api/me/engagements/:id/onboarding-contact";
  router.use(path, async (c, next) => { c.header("Cache-Control", "no-store"); await next(); }, deps.requireAuth);
  router.put("/api/me/engagements/:id/onboarding-contact", async c => {
    const user = c.get("user"); if (!user.workspaceId || !user.workspaceRole) return c.json({error: "workspace_not_found"}, 404);
    const id = c.req.param("id"); if (!z.string().uuid().safeParse(id).success) return c.json({error: "invalid_input"}, 400);
    const parsed = onboardingClientContactUpdate.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({error: "invalid_input"}, 400);
    const result = await deps.update(user.workspaceId, {userId: user.id, workspaceRole: user.workspaceRole}, id, parsed.data);
    if (["applied", "reused", "unchanged"].includes(result.kind)) return c.json(result);
    return c.json({error: result.kind, ...("issues" in result ? {issues: result.issues} : {})},
      result.kind === "not_found" ? 404 : result.kind === "forbidden" ? 403 : result.kind === "invalid_input" ? 400 : 409);
  });
  return router;
}
export const onboardingContactRoutes = createOnboardingContactRoutes();

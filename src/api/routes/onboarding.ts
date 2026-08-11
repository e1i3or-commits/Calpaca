import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  canCompleteOnboarding,
  isOnboardingComplete,
  isOnboardingRequired,
  nextOnboardingStep,
  onboardingSteps,
  ONBOARDING_STEPS,
  resumeOnboardingStep,
  type OnboardingFacts,
} from "../../core/onboarding/steps";
import { isGeneratedWorkspaceSlug, suggestWorkspaceSlug } from "../../core/workspace/slug";
import {
  completeOnboarding,
  getOnboardingFacts,
  recordOnboardingStep,
} from "../../db/onboarding-repo";

export interface OnboardingDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly getFacts: (
    userId: string,
    workspaceId: string,
  ) => Promise<OnboardingFacts | null>;
  readonly recordStep: typeof recordOnboardingStep;
  readonly complete: (userId: string) => Promise<string>;
}

const defaultDeps: OnboardingDeps = {
  requireAuth: requireSession,
  getFacts: (userId, workspaceId) => getOnboardingFacts(userId, workspaceId),
  recordStep: (userId, step) => recordOnboardingStep(userId, step),
  complete: (userId) => completeOnboarding(userId),
};

const stepBodySchema = z.object({ step: z.enum(ONBOARDING_STEPS) });

function serialize(facts: OnboardingFacts, user: { name: string; email: string }) {
  return {
    steps: onboardingSteps(facts),
    nextStep: nextOnboardingStep(facts),
    resumeStep: resumeOnboardingStep(facts),
    required: isOnboardingRequired(facts),
    complete: isOnboardingComplete(facts),
    canComplete: canCompleteOnboarding(facts),
    completedAt: facts.completedAt,
    workspace: {
      slug: facts.workspace.slug,
      slugIsPlaceholder: isGeneratedWorkspaceSlug(facts.workspace.slug),
      // Only a suggestion for the empty field — the host still has to accept it.
      suggestedSlug: isGeneratedWorkspaceSlug(facts.workspace.slug)
        ? suggestWorkspaceSlug({ name: user.name, email: user.email })
        : null,
    },
    calendars: facts.calendars,
    scheduleCount: facts.scheduleCount,
    eventTypeCount: facts.eventTypeCount,
  };
}

export function createOnboardingRoutes(deps: OnboardingDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/onboarding", deps.requireAuth);
  router.use("/api/me/onboarding/*", deps.requireAuth);

  router.get("/api/me/onboarding", async (c) => {
    const user = c.get("user");
    if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const facts = await deps.getFacts(user.id, user.workspaceId);
    if (!facts) return c.json({ error: "workspace_not_found" }, 404);
    return c.json(serialize(facts, user));
  });

  // Advancing is recorded server-side because the profile step has no other
  // trace: without it a reload would re-ask for name and timezone forever.
  router.patch("/api/me/onboarding/step", async (c) => {
    const user = c.get("user");
    if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = stepBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    await deps.recordStep(user.id, parsed.data.step);
    const facts = await deps.getFacts(user.id, user.workspaceId);
    if (!facts) return c.json({ error: "workspace_not_found" }, 404);
    return c.json(serialize(facts, user));
  });

  router.post("/api/me/onboarding/complete", async (c) => {
    const user = c.get("user");
    if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const facts = await deps.getFacts(user.id, user.workspaceId);
    if (!facts) return c.json({ error: "workspace_not_found" }, 404);
    if (isOnboardingComplete(facts)) {
      return c.json(serialize(facts, user));
    }
    // Finishing without a bookable link would leave the host on a dashboard
    // whose whole premise is that they have one.
    if (!canCompleteOnboarding(facts)) {
      return c.json({
        error: "onboarding_incomplete",
        nextStep: nextOnboardingStep(facts),
      }, 409);
    }
    const completedAt = await deps.complete(user.id);
    return c.json(serialize({ ...facts, completedAt }, user));
  });

  return router;
}

export const onboardingRoutes = createOnboardingRoutes();

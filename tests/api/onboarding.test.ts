import { describe, expect, test } from "bun:test";
import {
  createOnboardingRoutes,
  type OnboardingDeps,
} from "../../src/api/routes/onboarding";
import type { OnboardingFacts, OnboardingStepId } from "../../src/core/onboarding/steps";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function facts(overrides: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return {
    furthestStep: null,
    completedAt: null,
    workspace: { slug: "workspace-0a1b2c3d4e5f" },
    calendars: { connectedCount: 1, blockingCount: 0, hasWriteDestination: true },
    scheduleCount: 0,
    eventTypeCount: 0,
    ...overrides,
  };
}

function readyFacts(overrides: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return facts({
    furthestStep: "publish",
    workspace: { slug: "tourscale" },
    calendars: { connectedCount: 1, blockingCount: 1, hasWriteDestination: true },
    scheduleCount: 1,
    eventTypeCount: 1,
    ...overrides,
  });
}

function deps(overrides: Partial<OnboardingDeps> = {}): OnboardingDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", {
        id: USER_ID,
        email: "kai@tourscale.test",
        name: "Kai Kaapro",
        workspaceId: WORKSPACE_ID,
        workspaceRole: "owner",
      });
      await next();
    },
    getFacts: async () => facts(),
    recordStep: async (_userId, step) => step,
    complete: async () => "2026-08-11T12:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/me/onboarding", () => {
  test("reports the step list, the resume point, and that it is required", async () => {
    const response = await createOnboardingRoutes(deps()).request("/api/me/onboarding");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      steps: [
        { id: "profile", complete: false },
        { id: "calendars", complete: false },
        { id: "link", complete: false },
        { id: "publish", complete: false },
      ],
      nextStep: "profile",
      resumeStep: "profile",
      required: true,
      complete: false,
      canComplete: false,
    });
  });

  test("marks the workspace manageable for an owner", async () => {
    const response = await createOnboardingRoutes(deps()).request("/api/me/onboarding");
    expect(await response.json()).toMatchObject({ workspace: { canManage: true } });
  });

  // A member sent to the claim form met a 403 from PATCH /api/me/workspace and
  // could not finish setup at all.
  test("marks the workspace unmanageable for a member of someone else's workspace", async () => {
    const routes = createOnboardingRoutes(deps({
      requireAuth: async (c, next) => {
        c.set("user", {
          id: USER_ID,
          email: "jake@tourscale.test",
          name: "Jake",
          workspaceId: WORKSPACE_ID,
          workspaceRole: "member",
        });
        await next();
      },
      getFacts: async () => facts({ workspace: { slug: "tourscale" } }),
    }));
    const response = await routes.request("/api/me/onboarding");
    expect(await response.json()).toMatchObject({
      workspace: { slug: "tourscale", slugIsPlaceholder: false, canManage: false },
    });
  });

  test("suggests a slug from the signed-in identity while the placeholder stands", async () => {
    const response = await createOnboardingRoutes(deps()).request("/api/me/onboarding");
    expect(await response.json()).toMatchObject({
      workspace: {
        slug: "workspace-0a1b2c3d4e5f",
        slugIsPlaceholder: true,
        suggestedSlug: "kai-kaapro",
      },
    });
  });

  test("stops suggesting once a real slug is claimed", async () => {
    const router = createOnboardingRoutes(deps({ getFacts: async () => readyFacts() }));
    expect(await (await router.request("/api/me/onboarding")).json()).toMatchObject({
      workspace: { slug: "tourscale", slugIsPlaceholder: false, suggestedSlug: null },
      nextStep: null,
      canComplete: true,
    });
  });

  test("404s when the session has no workspace", async () => {
    const router = createOnboardingRoutes(deps({
      requireAuth: async (c, next) => {
        c.set("user", { id: USER_ID, email: "x@y.test", name: "X" });
        await next();
      },
    }));
    expect((await router.request("/api/me/onboarding")).status).toBe(404);
  });
});

describe("PATCH /api/me/onboarding/step", () => {
  test("records the step the host advanced to", async () => {
    const recorded: OnboardingStepId[] = [];
    const router = createOnboardingRoutes(deps({
      recordStep: async (_userId, step) => {
        recorded.push(step);
        return step;
      },
      getFacts: async () => facts({ furthestStep: "calendars" }),
    }));
    const response = await router.request("/api/me/onboarding/step", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "calendars" }),
    });
    expect(response.status).toBe(200);
    expect(recorded).toEqual(["calendars"]);
    // The profile step becomes answered by virtue of having been passed.
    const body = await response.json() as { steps: { id: string; complete: boolean }[] };
    expect(body.steps.find((step) => step.id === "profile")?.complete).toBe(true);
  });

  test("rejects a step name that is not part of the flow", async () => {
    const response = await createOnboardingRoutes(deps()).request("/api/me/onboarding/step", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "billing" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });
});

describe("POST /api/me/onboarding/complete", () => {
  test("marks onboarding finished once there is a bookable link", async () => {
    let completed = false;
    const router = createOnboardingRoutes(deps({
      getFacts: async () => readyFacts(),
      complete: async () => {
        completed = true;
        return "2026-08-11T12:00:00.000Z";
      },
    }));
    const response = await router.request("/api/me/onboarding/complete", { method: "POST" });
    expect(response.status).toBe(200);
    expect(completed).toBe(true);
    expect(await response.json()).toMatchObject({
      complete: true,
      required: false,
      completedAt: "2026-08-11T12:00:00.000Z",
    });
  });

  test("refuses to finish before anything is bookable, naming the next step", async () => {
    let completed = false;
    const router = createOnboardingRoutes(deps({
      complete: async () => {
        completed = true;
        return "2026-08-11T12:00:00.000Z";
      },
    }));
    const response = await router.request("/api/me/onboarding/complete", { method: "POST" });
    expect(response.status).toBe(409);
    expect(completed).toBe(false);
    expect(await response.json()).toEqual({
      error: "onboarding_incomplete",
      nextStep: "profile",
    });
  });

  test("is idempotent — a second finish does not rewrite the timestamp", async () => {
    let calls = 0;
    const router = createOnboardingRoutes(deps({
      getFacts: async () => readyFacts({ completedAt: "2026-08-01T09:00:00.000Z" }),
      complete: async () => {
        calls += 1;
        return "2026-08-11T12:00:00.000Z";
      },
    }));
    const response = await router.request("/api/me/onboarding/complete", { method: "POST" });
    expect(response.status).toBe(200);
    expect(calls).toBe(0);
    expect(await response.json()).toMatchObject({ completedAt: "2026-08-01T09:00:00.000Z" });
  });

  test("a host who deleted their starter event type is not dragged back in", async () => {
    const router = createOnboardingRoutes(deps({
      getFacts: async () => readyFacts({
        completedAt: "2026-08-01T09:00:00.000Z",
        eventTypeCount: 0,
      }),
    }));
    expect(await (await router.request("/api/me/onboarding")).json()).toMatchObject({
      complete: true,
      required: false,
    });
  });
});

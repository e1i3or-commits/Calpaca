import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import {
  createConversationRoutes,
  type ConversationDeps,
} from "../../src/api/routes/conversations";
import type { AuthEnv } from "../../src/auth/session";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const ENGAGEMENT_ID = "00000000-0000-4000-8000-000000000003";
const EVENT_TYPE_ID = "00000000-0000-4000-8000-000000000004";

const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  c.set("user", {
    id: USER_ID,
    email: "kai@example.test",
    name: "Kai",
    workspaceId: WORKSPACE_ID,
    workspaceRole: "member",
  });
  await next();
};

function deps(overrides: Partial<ConversationDeps> = {}): ConversationDeps {
  return {
    requireAuth,
    list: (async () => []) as ConversationDeps["list"],
    get: (async () => null) as ConversationDeps["get"],
    templates: (async () => []) as ConversationDeps["templates"],
    schedulingOptions: (async () => []) as ConversationDeps["schedulingOptions"],
    attach: (async () => "attached") as ConversationDeps["attach"],
    create: (async () => ({ kind: "forbidden" })) as ConversationDeps["create"],
    update: (async () => ({ kind: "not_found" })) as ConversationDeps["update"],
    ...overrides,
  };
}

describe("conversation routes", () => {
  test("lists conversations through engagement access", async () => {
    let received: unknown;
    const app = createConversationRoutes(deps({
      list: (async (workspaceId, actor, engagementId) => {
        received = { workspaceId, actor, engagementId };
        return [];
      }) as ConversationDeps["list"],
    }));
    const response = await app.request(
      `/api/me/engagements/${ENGAGEMENT_ID}/conversations`,
    );
    expect(response.status).toBe(200);
    expect(received).toEqual({
      workspaceId: WORKSPACE_ID,
      actor: { userId: USER_ID, workspaceRole: "member" },
      engagementId: ENGAGEMENT_ID,
    });
  });

  test("does not expose workspace templates without management access", async () => {
    const app = createConversationRoutes(deps({
      templates: (async () => null) as ConversationDeps["templates"],
    }));
    const response = await app.request(
      `/api/me/engagements/${ENGAGEMENT_ID}/conversations/templates`,
    );
    expect(response.status).toBe(404);
  });

  test("returns specific readiness issues instead of publishing an incomplete playbook", async () => {
    const app = createConversationRoutes(deps({
      update: (async () => ({
        kind: "not_ready",
        issues: ["outcome", "schedule"],
      })) as ConversationDeps["update"],
    }));
    const response = await app.request(
      `/api/me/engagements/${ENGAGEMENT_ID}/conversations/${EVENT_TYPE_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Kickoff",
          purpose: "Align the work",
          clientExplanation: "Meet the delivery team.",
          durationMinutes: 45,
          selectableDurations: [30, 45],
          participantRoles: [{ role: "account_lead", required: true }],
          preparationItems: [],
          outcomeDefinition: null,
          status: "ready",
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "playbook_not_ready",
      issues: ["outcome", "schedule"],
    });
  });

  test("keeps unavailable template assignment explicit", async () => {
    const app = createConversationRoutes(deps({
      attach: (async () => "playbook_not_available") as ConversationDeps["attach"],
    }));
    const response = await app.request(
      `/api/me/engagements/${ENGAGEMENT_ID}/conversations/${EVENT_TYPE_ID}/attach`,
      { method: "POST" },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "playbook_not_available" });
  });
});

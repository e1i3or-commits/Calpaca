import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { createEngagementRoutes, type EngagementDeps } from "../../src/api/routes/engagements";
import type { AuthEnv } from "../../src/auth/session";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const ENGAGEMENT_ID = "00000000-0000-4000-8000-000000000003";
const CLIENT_ID = "00000000-0000-4000-8000-000000000004";

const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  c.set("user", {
    id: USER_ID,
    email: "kai@example.com",
    name: "Kai",
    workspaceId: WORKSPACE_ID,
    workspaceRole: "member",
  });
  await next();
};

function deps(overrides: Partial<EngagementDeps> = {}): EngagementDeps {
  return {
    requireAuth,
    list: (async () => []) as EngagementDeps["list"],
    get: (async () => null) as EngagementDeps["get"],
    create: (async () => ({
      engagement: {
        id: ENGAGEMENT_ID,
        workspaceId: WORKSPACE_ID,
        clientId: CLIENT_ID,
        name: "Website launch",
        type: "project",
        status: "active",
        visibility: "workspace",
        accountLeadUserId: USER_ID,
        expectedEndDate: null,
        createdByUserId: USER_ID,
        createdAt: new Date("2026-07-24T12:00:00Z"),
        updatedAt: new Date("2026-07-24T12:00:00Z"),
      },
      client: {
        id: CLIENT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Acme",
        normalizedName: "acme",
        createdByUserId: USER_ID,
        createdAt: new Date("2026-07-24T12:00:00Z"),
        updatedAt: new Date("2026-07-24T12:00:00Z"),
      },
    })) as EngagementDeps["create"],
    similarClients: (async () => []) as EngagementDeps["similarClients"],
    updateStatus: (async () => ({ kind: "not_found" })) as EngagementDeps["updateStatus"],
    ...overrides,
  };
}

describe("engagement routes", () => {
  test("lists only through the actor workspace context", async () => {
    let received: unknown;
    const app = createEngagementRoutes(deps({
      list: (async (workspaceId, actor, filters) => {
        received = { workspaceId, actor, filters };
        return [];
      }) as EngagementDeps["list"],
    }));
    const response = await app.request("/api/me/engagements?status=active&search=acme");
    expect(response.status).toBe(200);
    expect(received).toEqual({
      workspaceId: WORKSPACE_ID,
      actor: { userId: USER_ID, workspaceRole: "member" },
      filters: { status: "active", search: "acme" },
    });
  });

  test("creates a potential engagement with explicit visibility", async () => {
    let received: unknown;
    const app = createEngagementRoutes(deps({
      create: (async (workspaceId, actor, input) => {
        received = { workspaceId, actor, input };
        return await deps().create(workspaceId, actor, input);
      }) as EngagementDeps["create"],
    }));
    const response = await app.request("/api/me/engagements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientName: "Acme",
        name: "Website launch",
        type: "project",
        status: "potential",
        visibility: "restricted",
        accountLeadUserId: USER_ID,
      }),
    });
    expect(response.status).toBe(201);
    expect(received).toEqual({
      workspaceId: WORKSPACE_ID,
      actor: { userId: USER_ID, workspaceRole: "member" },
      input: {
        clientName: "Acme",
        name: "Website launch",
        type: "project",
        status: "potential",
        visibility: "restricted",
        accountLeadUserId: USER_ID,
      },
    });
  });

  test("reports invalid fields without creating", async () => {
    let called = false;
    const app = createEngagementRoutes(deps({
      create: (async () => {
        called = true;
        return await deps().create(WORKSPACE_ID, {
          userId: USER_ID,
          workspaceRole: "member",
        }, {} as never);
      }) as EngagementDeps["create"],
    }));
    const response = await app.request("/api/me/engagements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientName: "" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { fields: string[] };
    expect(body.fields).toContain("clientName");
    expect(body.fields).toContain("name");
    expect(called).toBe(false);
  });

  test("keeps restricted engagement discovery indistinguishable from missing", async () => {
    const app = createEngagementRoutes(deps());
    const response = await app.request(`/api/me/engagements/${ENGAGEMENT_ID}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "engagement_not_found" });
  });

  test("returns duplicate client candidates", async () => {
    const app = createEngagementRoutes(deps({
      similarClients: (async () => [{ id: CLIENT_ID, name: "Acme" }]) as EngagementDeps["similarClients"],
    }));
    const response = await app.request("/api/me/engagements/clients/similar?name=Acme");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clients: [{ id: CLIENT_ID, name: "Acme" }],
    });
  });
});

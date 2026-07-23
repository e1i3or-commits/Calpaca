import { describe, expect, test } from "bun:test";
import {
  createWorkspaceRoutes,
  type WorkspaceDeps,
} from "../../src/api/routes/workspace";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const DOMAIN_ID = "33333333-3333-4333-8333-333333333333";
const createdAt = new Date("2026-07-23T12:00:00Z");

function deps(overrides: Partial<WorkspaceDeps> = {}): WorkspaceDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", {
        id: USER_ID,
        email: "owner@example.test",
        name: "Owner",
        workspaceId: WORKSPACE_ID,
        workspaceRole: "owner",
      });
      await next();
    },
    getContext: async () => ({
      id: WORKSPACE_ID,
      name: "TourScale",
      slug: "default",
      plan: "self_hosted",
      role: "owner",
      entitlements: {
        memberLimit: null,
        customDomains: true,
        whitelabel: true,
        inviteeCalendarOverlay: true,
        meetingPolls: true,
      },
    }),
    listDomains: async () => [],
    addDomain: async (_workspaceId, hostname) => ({
      id: DOMAIN_ID,
      workspaceId: WORKSPACE_ID,
      hostname,
      status: "pending",
      verificationToken: "verify",
      isPrimary: false,
      createdAt,
      dnsRecord: {
        type: "TXT",
        name: `_calpaca.${hostname}`,
        value: "verify",
      },
    }),
    removeDomain: async (_workspaceId, id) => id === DOMAIN_ID,
    updateName: async (_workspaceId, name) => ({ id: WORKSPACE_ID, name }),
    ...overrides,
  };
}

describe("workspace routes", () => {
  test("returns plan entitlements and deployment mode", async () => {
    const response = await createWorkspaceRoutes(deps()).request("/api/me/workspace");
    expect(response.status).toBe(200);
    const body = await response.json() as {
      workspace: { name: string; entitlements: { customDomains: boolean } };
      deploymentMode: string;
    };
    expect(body.workspace.name).toBe("TourScale");
    expect(body.workspace.entitlements.customDomains).toBe(true);
    expect(body.deploymentMode).toBe("self_hosted");
  });

  test("creates a pending domain and returns its TXT proof once", async () => {
    const response = await createWorkspaceRoutes(deps()).request(
      "/api/me/workspace/domains",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "cal.tourscale.com" }),
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      domain: {
        hostname: "cal.tourscale.com",
        status: "pending",
        dnsRecord: {
          type: "TXT",
          name: "_calpaca.cal.tourscale.com",
          value: "verify",
        },
      },
    });
  });

  test("free workspaces cannot add custom domains", async () => {
    const base = await deps().getContext(WORKSPACE_ID, USER_ID);
    const router = createWorkspaceRoutes(deps({
      getContext: async () => ({
        ...base!,
        plan: "free",
        entitlements: { ...base!.entitlements, customDomains: false },
      }),
    }));
    const response = await router.request("/api/me/workspace/domains", {
      method: "POST",
      body: JSON.stringify({ hostname: "cal.example.com" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "upgrade_required" });
  });

  test("members cannot change workspace settings", async () => {
    const router = createWorkspaceRoutes(deps({
      requireAuth: async (c, next) => {
        c.set("user", {
          id: USER_ID,
          email: "member@example.test",
          name: "Member",
          workspaceId: WORKSPACE_ID,
          workspaceRole: "member",
        });
        await next();
      },
    }));
    expect((await router.request("/api/me/workspace", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nope" }),
    })).status).toBe(403);
  });
});

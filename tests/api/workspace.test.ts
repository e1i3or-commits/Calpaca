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
      name: "Example Agency",
      slug: "default",
      plan: "self_hosted",
      grantedPlan: "self_hosted",
      trial: null,
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
    updateSlug: async (_workspaceId, slug) => ({
      id: WORKSPACE_ID,
      name: "Example Agency",
      slug,
    }),
    slugTaken: async (slug) => slug === "taken-slug",
    getDomainForVerification: async (_workspaceId, id) => id === DOMAIN_ID
      ? {
          id: DOMAIN_ID,
          hostname: "cal.example.com",
          status: "pending",
          verificationToken: "verify",
          isPrimary: false,
        }
      : null,
    markDomainVerified: async (_workspaceId, id) => id === DOMAIN_ID
      ? {
          id: DOMAIN_ID,
          hostname: "cal.example.com",
          status: "verified",
          isPrimary: true,
        }
      : null,
    resolveTxt: async () => [["verify"]],
    provisionDomain: async () => "provisioned",
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
    expect(body.workspace.name).toBe("Example Agency");
    expect(body.workspace.entitlements.customDomains).toBe(true);
    expect(body.deploymentMode).toBe("self_hosted");
  });

  test("creates a pending domain and returns its TXT proof once", async () => {
    const response = await createWorkspaceRoutes(deps()).request(
      "/api/me/workspace/domains",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "calendar.client.example" }),
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      domain: {
        hostname: "calendar.client.example",
        status: "pending",
        dnsRecord: {
          type: "TXT",
          name: "_calpaca.calendar.client.example",
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

  test("reports a free slug as available, normalized", async () => {
    const response = await createWorkspaceRoutes(deps())
      .request("/api/me/workspace/slug-available?slug=TourScale%20Leadership");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      slug: "tourscale-leadership",
      available: true,
      reason: null,
    });
  });

  test("reports taken and reserved candidates without failing the request", async () => {
    const router = createWorkspaceRoutes(deps());
    expect(await (await router.request("/api/me/workspace/slug-available?slug=taken-slug")).json())
      .toEqual({ slug: "taken-slug", available: false, reason: "taken" });
    expect(await (await router.request("/api/me/workspace/slug-available?slug=booking")).json())
      .toEqual({ slug: null, available: false, reason: "reserved" });
    expect(await (await router.request("/api/me/workspace/slug-available?slug=%21%21")).json())
      .toEqual({ slug: null, available: false, reason: "invalid_characters" });
  });

  // Re-opening the wizard on the slug step must not report the host's own slug
  // as taken by someone else.
  test("treats the workspace's current slug as available to itself", async () => {
    const response = await createWorkspaceRoutes(deps({
      slugTaken: async () => true,
    })).request("/api/me/workspace/slug-available?slug=default");
    expect(await response.json()).toEqual({ slug: "default", available: true, reason: null });
  });

  test("claims a slug through PATCH and normalizes it first", async () => {
    const claimed: string[] = [];
    const response = await createWorkspaceRoutes(deps({
      updateSlug: async (_workspaceId, slug) => {
        claimed.push(slug);
        return { id: WORKSPACE_ID, name: "Example Agency", slug };
      },
    })).request("/api/me/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "  TourScale  " }),
    });
    expect(response.status).toBe(200);
    expect(claimed).toEqual(["tourscale"]);
  });

  test("rejects a reserved slug before it reaches the database", async () => {
    let called = false;
    const response = await createWorkspaceRoutes(deps({
      updateSlug: async (_workspaceId, slug) => {
        called = true;
        return { id: WORKSPACE_ID, name: "Example Agency", slug };
      },
    })).request("/api/me/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "p" }),
    });
    expect(response.status).toBe(400);
    expect(called).toBe(false);
    expect(await response.json()).toEqual({ error: "invalid_slug", reason: "reserved" });
  });

  test("surfaces the unique-index race as a conflict", async () => {
    const response = await createWorkspaceRoutes(deps({
      updateSlug: async () => "slug_taken",
    })).request("/api/me/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "tourscale" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "slug_taken" });
  });

  test("still accepts a name-only rename", async () => {
    const response = await createWorkspaceRoutes(deps()).request("/api/me/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workspace: { id: WORKSPACE_ID, name: "Renamed" } });
  });

  test("requires at least one field to change", async () => {
    const response = await createWorkspaceRoutes(deps()).request("/api/me/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  test("verifies the TXT proof before provisioning the hostname", async () => {
    const response = await createWorkspaceRoutes(deps()).request(
      `/api/me/workspace/domains/${DOMAIN_ID}/verify`,
      { method: "POST" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      domain: {
        id: DOMAIN_ID,
        hostname: "cal.example.com",
        status: "verified",
        isPrimary: true,
      },
      provisioning: "provisioned",
    });
  });

  test("does not provision when the TXT proof does not match", async () => {
    let provisioned = false;
    const response = await createWorkspaceRoutes(deps({
      resolveTxt: async () => [["wrong"]],
      provisionDomain: async () => {
        provisioned = true;
        return "provisioned";
      },
    })).request(`/api/me/workspace/domains/${DOMAIN_ID}/verify`, {
      method: "POST",
    });
    expect(response.status).toBe(409);
    expect(provisioned).toBe(false);
  });
});

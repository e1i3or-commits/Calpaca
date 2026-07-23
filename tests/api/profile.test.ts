import { describe, expect, test } from "bun:test";
import {
  createProfileRoutes,
  type ProfileDeps,
} from "../../src/api/routes/profile";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_ID = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-23T12:00:00Z");
const profile = {
  id: USER_ID,
  name: "Kai",
  email: "kai@example.test",
  timezone: "America/New_York",
  image: null,
};
const record = {
  id: TOKEN_ID,
  name: "n8n",
  prefix: "calpaca_example",
  expiresAt: null,
  lastUsedAt: null,
  createdAt: now,
};

function deps(overrides: Partial<ProfileDeps> = {}): ProfileDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: USER_ID, name: "Kai", email: "kai@example.test" });
      await next();
    },
    getProfile: async () => profile,
    updateProfile: async (_id, patch) => ({ ...profile, ...patch }),
    listApiTokens: async () => [record],
    createApiToken: async () => ({ token: "calpaca_secret", record }),
    revokeApiToken: async (_userId, id) => id === TOKEN_ID,
    ...overrides,
  };
}

async function request(router: ReturnType<typeof createProfileRoutes>, path: string, body: unknown) {
  return router.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("profile routes", () => {
  test("reads and updates a custom profile image", async () => {
    const router = createProfileRoutes(deps());
    expect((await router.request("/api/me/profile")).status).toBe(200);
    const response = await request(router, "/api/me/profile", {
      name: "Kai K",
      timezone: "UTC",
      image: "data:image/png;base64,aGVsbG8=",
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { profile: typeof profile }).profile.name).toBe("Kai K");
  });

  test("rejects unsafe image URLs and invalid timezones", async () => {
    const router = createProfileRoutes(deps());
    const response = await request(router, "/api/me/profile", {
      name: "Kai",
      timezone: "Mars/Base",
      image: "javascript:alert(1)",
    });
    expect(response.status).toBe(400);
  });

  test("shows a new token once and lists only its prefix", async () => {
    const router = createProfileRoutes(deps());
    const created = await router.request("/api/me/api-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "n8n", expiresAt: null }),
    });
    expect(created.status).toBe(201);
    expect((await created.json()) as object).toMatchObject({ token: "calpaca_secret" });

    const listed = await router.request("/api/me/api-tokens");
    const body = await listed.json() as { tokens: object[] };
    expect(body.tokens).toEqual([{
      ...record,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: now.toISOString(),
    }]);
    expect(JSON.stringify(body)).not.toContain("calpaca_secret");
  });

  test("revokes only a token owned by the current user", async () => {
    const router = createProfileRoutes(deps());
    expect((await router.request(`/api/me/api-tokens/${TOKEN_ID}`, {
      method: "DELETE",
    })).status).toBe(200);
    expect((await router.request("/api/me/api-tokens/33333333-3333-4333-8333-333333333333", {
      method: "DELETE",
    })).status).toBe(404);
  });
});

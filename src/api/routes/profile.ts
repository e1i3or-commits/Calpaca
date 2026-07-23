import { Hono } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  createApiToken,
  getProfile,
  listApiTokens,
  revokeApiToken,
  updateProfile,
} from "../../db/profile-repo";
import { isIanaZone } from "../../lib/timezone";
import type { MiddlewareHandler } from "hono";

const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().refine(isIanaZone, "must be an IANA timezone"),
  image: z.string().max(700_000).refine(
    (value) => value.startsWith("https://") || DATA_IMAGE_RE.test(value),
    "must be an HTTPS URL or PNG, JPEG, or WebP image",
  ).nullable(),
});

const tokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresAt: z.string().datetime().nullable().default(null),
});

function serializeToken<T extends {
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}>(row: T) {
  return {
    ...row,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ProfileDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly getProfile: typeof getProfile;
  readonly updateProfile: typeof updateProfile;
  readonly listApiTokens: typeof listApiTokens;
  readonly createApiToken: typeof createApiToken;
  readonly revokeApiToken: typeof revokeApiToken;
}

const defaultDeps: ProfileDeps = {
  requireAuth: requireSession,
  getProfile,
  updateProfile,
  listApiTokens,
  createApiToken,
  revokeApiToken,
};

export function createProfileRoutes(deps: ProfileDeps = defaultDeps) {
  return new Hono<AuthEnv>()
  .use("/api/me/profile/*", deps.requireAuth)
  .use("/api/me/profile", deps.requireAuth)
  .use("/api/me/api-tokens/*", deps.requireAuth)
  .use("/api/me/api-tokens", deps.requireAuth)
  .get("/api/me/profile", async (c) => {
    const profile = await deps.getProfile(c.get("user").id);
    return profile ? c.json({ profile }) : c.json({ error: "profile_not_found" }, 404);
  })
  .patch("/api/me/profile", async (c) => {
    const parsed = profileSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const profile = await deps.updateProfile(c.get("user").id, parsed.data);
    return profile ? c.json({ profile }) : c.json({ error: "profile_not_found" }, 404);
  })
  .get("/api/me/api-tokens", async (c) => {
    const tokens = await deps.listApiTokens(c.get("user").id);
    return c.json({ tokens: tokens.map(serializeToken) });
  })
  .post("/api/me/api-tokens", async (c) => {
    const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const created = await deps.createApiToken(
      c.get("user").id,
      parsed.data.name,
      parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    );
    return c.json({
      token: created.token,
      record: serializeToken(created.record),
    }, 201);
  })
  .delete("/api/me/api-tokens/:id", async (c) => {
    const revoked = await deps.revokeApiToken(c.get("user").id, c.req.param("id"));
    return revoked ? c.json({ ok: true }) : c.json({ error: "token_not_found" }, 404);
  });
}

export const profileRoutes = createProfileRoutes();

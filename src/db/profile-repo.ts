import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { apiTokens, users } from "./schema";

type Db = NodePgDatabase<typeof schema>;

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getProfile(userId: string, executor: Db = getDb()) {
  const [row] = await executor
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      timezone: users.timezone,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

export async function updateProfile(
  userId: string,
  patch: { name: string; timezone: string; image: string | null },
  executor: Db = getDb(),
) {
  const [row] = await executor
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      timezone: users.timezone,
      image: users.image,
    });
  return row ?? null;
}

export async function listApiTokens(userId: string, executor: Db = getDb()) {
  return executor
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(apiTokens.createdAt);
}

export async function createApiToken(
  userId: string,
  name: string,
  expiresAt: Date | null,
  executor: Db = getDb(),
) {
  const token = `calpaca_${randomBytes(32).toString("base64url")}`;
  const [row] = await executor
    .insert(apiTokens)
    .values({
      userId,
      name,
      prefix: token.slice(0, 16),
      tokenHash: hashApiToken(token),
      expiresAt,
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    });
  return { token, record: row! };
}

export async function revokeApiToken(
  userId: string,
  id: string,
  executor: Db = getDb(),
): Promise<boolean> {
  const rows = await executor
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

export async function authenticateApiToken(
  token: string,
  now = new Date(),
  executor: Db = getDb(),
) {
  const [row] = await executor
    .select({
      tokenId: apiTokens.id,
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(and(
      eq(apiTokens.tokenHash, hashApiToken(token)),
      or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
    ))
    .limit(1);
  if (!row || row.status !== "active") return null;
  await executor
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(eq(apiTokens.id, row.tokenId));
  return { id: row.id, email: row.email, name: row.name };
}

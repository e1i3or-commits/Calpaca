import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { webhooks } from "./schema";

type Db = NodePgDatabase<typeof schema>;

export interface WebhookRow {
  readonly id: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly secret: string;
  readonly active: boolean;
}

function toRow(row: typeof webhooks.$inferSelect): WebhookRow {
  return { id: row.id, url: row.url, events: row.events, secret: row.secret, active: row.active };
}

export async function listActiveWebhooks(executor: Db = getDb()): Promise<WebhookRow[]> {
  const rows = await executor.select().from(webhooks).where(eq(webhooks.active, true));
  return rows.map(toRow);
}

export async function listWebhooks(executor: Db = getDb()): Promise<WebhookRow[]> {
  return (await executor.select().from(webhooks)).map(toRow);
}

export async function getWebhook(id: string, executor: Db = getDb()): Promise<WebhookRow | null> {
  const [row] = await executor.select().from(webhooks).where(eq(webhooks.id, id));
  return row ? toRow(row) : null;
}

/** Secret is generated server-side and returned exactly once (on create);
 * list responses redact it. */
export async function createWebhook(
  input: { url: string; events: string[] },
  executor: Db = getDb(),
): Promise<WebhookRow> {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await executor
    .insert(webhooks)
    .values({ url: input.url, events: input.events, secret })
    .returning();
  return toRow(row!);
}

export async function setWebhookActive(
  id: string,
  active: boolean,
  executor: Db = getDb(),
): Promise<WebhookRow | null> {
  const [row] = await executor.update(webhooks).set({ active }).where(eq(webhooks.id, id)).returning();
  return row ? toRow(row) : null;
}

export async function deleteWebhook(id: string, executor: Db = getDb()): Promise<boolean> {
  const rows = await executor.delete(webhooks).where(eq(webhooks.id, id)).returning({ id: webhooks.id });
  return rows.length > 0;
}

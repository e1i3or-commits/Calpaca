import { randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { webhookDeliveries, webhooks } from "./schema";
import type { WebhookEventKind } from "../core/webhook/payload";

type Db = NodePgDatabase<typeof schema>;

export interface WebhookRow {
  readonly id: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly secret: string;
  readonly active: boolean;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookDeliveryRow {
  readonly id: string;
  readonly webhookId: string;
  readonly event: string;
  readonly status: WebhookDeliveryStatus;
  readonly attempts: number;
  readonly lastHttpStatus: number | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
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

export async function createWebhookDelivery(
  input: { id: string; webhookId: string; event: WebhookEventKind },
  executor: Db = getDb(),
): Promise<void> {
  await executor.insert(webhookDeliveries).values(input);
}

export async function recordWebhookDeliveryAttempt(
  id: string,
  outcome: {
    delivered: boolean;
    exhausted: boolean;
    httpStatus?: number;
    error?: string;
  },
  executor: Db = getDb(),
): Promise<void> {
  const completed = outcome.delivered || outcome.exhausted;
  await executor
    .update(webhookDeliveries)
    .set({
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      status: outcome.delivered ? "delivered" : outcome.exhausted ? "failed" : "pending",
      lastHttpStatus: outcome.httpStatus ?? null,
      lastError: outcome.error ?? null,
      completedAt: completed ? new Date() : null,
    })
    .where(eq(webhookDeliveries.id, id));
}

export async function listWebhookDeliveries(
  webhookId: string,
  limit: number,
  executor: Db = getDb(),
): Promise<WebhookDeliveryRow[]> {
  const rows = await executor
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(limit);
  return rows as WebhookDeliveryRow[];
}

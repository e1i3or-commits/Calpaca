import { lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import { rateLimits } from "./schema";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export async function incrementRateLimit(
  key: string,
  bucketStart: Temporal.Instant,
  executor: Db = getDb(),
): Promise<number> {
  const [row] = await executor
    .insert(rateLimits)
    .values({
      key,
      bucketStart: new Date(bucketStart.epochMilliseconds),
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.bucketStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (!row) throw new Error("rate-limit increment returned no row");
  return row.count;
}

export async function reapRateLimits(
  olderThan: Temporal.Instant,
  executor: Db = getDb(),
): Promise<number> {
  const rows = await executor
    .delete(rateLimits)
    .where(lt(rateLimits.bucketStart, new Date(olderThan.epochMilliseconds)))
    .returning({ key: rateLimits.key });
  return rows.length;
}

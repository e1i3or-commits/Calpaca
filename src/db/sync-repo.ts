import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { calendarBusyCache, calendarConnections } from "./schema";
import type { BusyChange } from "../sync/busy-mapping";
import type { SyncRepo } from "../sync/engine";

type Db = NodePgDatabase<typeof schema>;

// a 90-day full sync of a busy calendar can run to thousands of rows;
// Postgres bind messages choke long before the 65535-param limit
const INSERT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The Drizzle-backed SyncRepo the engine's fakes stand in for. */
export function makeSyncRepo(executor: Db = getDb()): SyncRepo {
  return {
    // full sync: swap the whole cache in one transaction so availability
    // reads never see a half-replaced state
    async replaceBusy(connectionId, busy) {
      await executor.transaction(async (tx) => {
        await tx.delete(calendarBusyCache).where(eq(calendarBusyCache.connectionId, connectionId));
        const rows = busy
          .filter((c): c is Extract<BusyChange, { kind: "upsert" }> => c.kind === "upsert")
          .map((c) => ({
            connectionId,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            externalEventId: c.externalEventId,
          }));
        for (const batch of chunk(rows, INSERT_CHUNK)) {
          await tx.insert(calendarBusyCache).values(batch);
        }
      });
    },

    async applyChanges(connectionId, changes) {
      if (changes.length === 0) return;
      await executor.transaction(async (tx) => {
        const deletes = changes
          .filter((c) => c.kind === "delete")
          .map((c) => c.externalEventId);
        if (deletes.length > 0) {
          await tx
            .delete(calendarBusyCache)
            .where(
              and(
                eq(calendarBusyCache.connectionId, connectionId),
                inArray(calendarBusyCache.externalEventId, deletes),
              ),
            );
        }
        for (const change of changes) {
          if (change.kind !== "upsert") continue;
          await tx
            .insert(calendarBusyCache)
            .values({
              connectionId,
              startsAt: change.startsAt,
              endsAt: change.endsAt,
              externalEventId: change.externalEventId,
            })
            .onConflictDoUpdate({
              // matches the busy_event_uq partial index predicate
              target: [calendarBusyCache.connectionId, calendarBusyCache.externalEventId],
              targetWhere: isNotNull(calendarBusyCache.externalEventId),
              set: { startsAt: change.startsAt, endsAt: change.endsAt },
            });
        }
      });
    },

    async saveSyncState(connectionId, state) {
      await executor
        .update(calendarConnections)
        .set({
          syncToken: state.syncToken,
          lastSyncedAt: state.lastSyncedAt,
          ...(state.fullSync ? { fullSyncedAt: state.lastSyncedAt } : {}),
          syncHealthy: true,
        })
        .where(eq(calendarConnections.id, connectionId));
    },

    async markUnhealthy(connectionId) {
      await executor
        .update(calendarConnections)
        .set({ syncHealthy: false })
        .where(eq(calendarConnections.id, connectionId));
    },
  };
}

export type ConnectionRow = typeof calendarConnections.$inferSelect;

/** Every google connection, for the sweep job. */
export async function listGoogleConnections(executor: Db = getDb()): Promise<ConnectionRow[]> {
  return executor
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.provider, "google"));
}

/** The connection booking write-through targets: the user's primary-alias
 * connection when present (the sign-in seed), else their first google one. */
export async function getWritableConnectionForUser(
  userId: string,
  executor: Db = getDb(),
): Promise<ConnectionRow | null> {
  const rows = await executor
    .select()
    .from(calendarConnections)
    .where(and(
      eq(calendarConnections.userId, userId),
      eq(calendarConnections.provider, "google"),
    ));
  return rows.find((r) => r.externalCalendarId === "primary") ?? rows[0] ?? null;
}

/** Seeds a new busy-source. The caller enqueues the initial sync; the watch
 * channel follows via the hourly renewal job (channel columns start null). */
export async function createConnection(
  userId: string,
  externalCalendarId: string,
  executor: Db = getDb(),
): Promise<ConnectionRow> {
  const [row] = await executor
    .insert(calendarConnections)
    .values({ userId, provider: "google", externalCalendarId })
    .returning();
  if (!row) throw new Error("calendar connection insert returned no row");
  return row;
}

/** Removes a busy-source; its calendar_busy_cache rows cascade with the FK. */
export async function deleteConnection(connectionId: string, executor: Db = getDb()): Promise<void> {
  await executor.delete(calendarConnections).where(eq(calendarConnections.id, connectionId));
}

export async function getConnection(
  connectionId: string,
  executor: Db = getDb(),
): Promise<ConnectionRow | null> {
  const [row] = await executor
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.id, connectionId));
  return row ?? null;
}

/** Webhook pushes identify the connection by our channel id. */
export async function getConnectionByChannelId(
  channelId: string,
  executor: Db = getDb(),
): Promise<ConnectionRow | null> {
  const [row] = await executor
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.channelId, channelId));
  return row ?? null;
}

/** Connections whose watch channel is missing or expires before `deadline`. */
export async function listConnectionsNeedingChannel(
  deadline: Date,
  executor: Db = getDb(),
): Promise<ConnectionRow[]> {
  return executor
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.provider, "google"),
        or(
          isNull(calendarConnections.channelExpiresAt),
          lt(calendarConnections.channelExpiresAt, deadline),
        ),
      ),
    );
}

export async function saveChannel(
  connectionId: string,
  channel: { channelId: string; channelResourceId: string; channelToken: string; channelExpiresAt: Date },
  executor: Db = getDb(),
): Promise<void> {
  await executor.update(calendarConnections).set(channel).where(eq(calendarConnections.id, connectionId));
}

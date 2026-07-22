import PgBoss from "pg-boss";
import { getAuth } from "../auth/index";
import { syncConnection } from "../sync/engine";
import { listEvents, watchEvents } from "../sync/google";
import {
  getConnection,
  listConnectionsNeedingChannel,
  listGoogleConnections,
  makeSyncRepo,
  saveChannel,
  type ConnectionRow,
} from "../db/sync-repo";

// In-process pg-boss workers, started alongside the Hono server: one
// container, Postgres as the only infrastructure (pg-boss lives in its own
// `pgboss` schema in the same database).
//
// calendar-sync    per-connection sync, debounced via singletonKey so a
//                  burst of webhook pushes collapses to one run
// sync-sweep       15-min poll fallback: enqueues calendar-sync for every
//                  connection; the only trigger in dev (no public URL)
// channel-renewal  hourly: (re)establishes watch channels expiring within
//                  24h; skipped entirely without PUBLIC_URL

export const SYNC_QUEUE = "calendar-sync";
const SWEEP_QUEUE = "sync-sweep";
const RENEWAL_QUEUE = "channel-renewal";

const CHANNEL_RENEW_AHEAD_MS = 24 * 60 * 60 * 1000;

// the sync token freezes the 90-day full-sync window (see
// FULL_SYNC_WINDOW_DAYS in src/sync/engine.ts); re-baseline weekly so the
// window keeps rolling well ahead of any booking horizon
const FULL_RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

let boss: PgBoss | undefined;

export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: "pgboss",
    });
    boss.on("error", (e) => console.error("[jobs] pg-boss error:", e));
  }
  return boss;
}

export async function enqueueSync(connectionId: string, opts?: { forceFull?: boolean }): Promise<void> {
  await getBoss().send(
    SYNC_QUEUE,
    { connectionId, forceFull: opts?.forceFull ?? false },
    // debounce: at most one queued sync per connection per 30s window
    { singletonKey: connectionId, singletonSeconds: 30 },
  );
}

async function runSync(connectionId: string, forceFull: boolean): Promise<void> {
  const conn = await getConnection(connectionId);
  if (!conn) return; // connection removed since enqueue
  const repo = makeSyncRepo();
  try {
    const token = await getAuth().api.getAccessToken({
      body: { providerId: "google", userId: conn.userId },
    });
    const result = await syncConnection(
      // dropping the token re-baselines the frozen full-sync window
      forceFull ? { ...conn, syncToken: null } : conn,
      token.accessToken,
      { listEvents, now: () => new Date() },
      repo,
    );
    if (!result.ok) {
      console.error(`[jobs] sync ${connectionId} failed:`, result.error);
      return; // engine already marked unhealthy; stale-but-flagged
    }
    console.log(
      `[jobs] sync ${connectionId}: ${result.value.mode}, ${result.value.changes} change(s)`,
    );
  } catch (e) {
    // token refresh failure etc. — flag rather than throw so pg-boss does
    // not retry into the same wall
    await repo.markUnhealthy(connectionId);
    console.error(`[jobs] sync ${connectionId} threw:`, e);
  }
}

async function renewChannel(conn: ConnectionRow, address: string): Promise<void> {
  const token = await getAuth().api.getAccessToken({
    body: { providerId: "google", userId: conn.userId },
  });
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomUUID();
  const watched = await watchEvents({
    accessToken: token.accessToken,
    calendarId: conn.externalCalendarId,
    channelId,
    channelToken,
    address,
  });
  if (!watched.ok) {
    console.error(`[jobs] watch for ${conn.id} failed:`, watched.error);
    return;
  }
  await saveChannel(conn.id, {
    channelId,
    channelResourceId: watched.value.resourceId,
    channelToken,
    channelExpiresAt: watched.value.expiration,
  });
  console.log(`[jobs] watch channel for ${conn.id} renewed until ${watched.value.expiration.toISOString()}`);
}

export async function startJobs(): Promise<void> {
  const b = getBoss();
  await b.start();
  await b.createQueue(SYNC_QUEUE);
  await b.createQueue(SWEEP_QUEUE);

  await b.work<{ connectionId: string; forceFull?: boolean }>(SYNC_QUEUE, async ([job]) => {
    if (job) await runSync(job.data.connectionId, job.data.forceFull ?? false);
  });

  await b.work(SWEEP_QUEUE, async () => {
    const staleBefore = Date.now() - FULL_RESYNC_AFTER_MS;
    for (const conn of await listGoogleConnections()) {
      const forceFull = !conn.fullSyncedAt || conn.fullSyncedAt.getTime() < staleBefore;
      await enqueueSync(conn.id, { forceFull });
    }
  });
  await b.schedule(SWEEP_QUEUE, "*/15 * * * *");

  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl) {
    await b.createQueue(RENEWAL_QUEUE);
    const address = `${publicUrl.replace(/\/$/, "")}/api/webhooks/google-calendar`;
    await b.work(RENEWAL_QUEUE, async () => {
      const deadline = new Date(Date.now() + CHANNEL_RENEW_AHEAD_MS);
      for (const conn of await listConnectionsNeedingChannel(deadline)) {
        await renewChannel(conn, address);
      }
    });
    await b.schedule(RENEWAL_QUEUE, "0 * * * *");
    // don't wait an hour for the first channel after boot
    await b.send(RENEWAL_QUEUE, {});
  } else {
    console.log("[jobs] PUBLIC_URL unset: watch channels disabled, relying on 15-min sweep");
  }

  // initial sweep so a fresh boot syncs immediately
  await b.send(SWEEP_QUEUE, {});
  console.log("[jobs] pg-boss started");
}

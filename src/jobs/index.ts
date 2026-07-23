import PgBoss from "pg-boss";
import { Temporal } from "@js-temporal/polyfill";
import { getAuth } from "../auth/index";
import { syncConnection } from "../sync/engine";
import { listEvents, watchEvents } from "../sync/google";
import { REMINDER_LEAD, sendInvite, sendReminder } from "./invite-email";
import type { InviteKind } from "../core/invite/email";
import { listBookingsNeedingReminder } from "../db/booking-repo";
import { expireHolds } from "../db/holds-repo";
import { reapRateLimits } from "../db/rate-limit-repo";
import {
  deliverWebhook,
  fanOutBookingWebhooks,
  fanOutPollWebhooks,
  fanOutSuggestionWebhooks,
  type BookingWebhookKind,
  type DeliveryJob,
} from "./webhook-delivery";
import { sendSuggestionEmail } from "./suggestion-email";
import { sendPollFinalization } from "./poll-finalization-email";
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
// invite-email     one send per booking lifecycle change (ICS + text);
//                  retried by pg-boss, no-op when SMTP is not configured
// webhook-fanout   one per lifecycle change: builds a signed-body delivery
//                  job per active matching endpoint
// webhook-delivery one POST per endpoint per event; per-endpoint retries so
//                  a dead consumer never delays another
// reminder-sweep   5-min poll: enqueues one invite-email "reminder" per
//                  confirmed booking entering the 24h-before window
// hold-expiry      5-min poll: releases expired active holds (confirmation
//                  re-checks expiry itself; this is hygiene, not correctness)

export const SYNC_QUEUE = "calendar-sync";
const SWEEP_QUEUE = "sync-sweep";
const RENEWAL_QUEUE = "channel-renewal";
const INVITE_QUEUE = "invite-email";
const SUGGESTION_EMAIL_QUEUE = "suggestion-email";
const POLL_FINALIZATION_EMAIL_QUEUE = "poll-finalization-email";
const WEBHOOK_FANOUT_QUEUE = "webhook-fanout";
const WEBHOOK_DELIVERY_QUEUE = "webhook-delivery";
const REMINDER_SWEEP_QUEUE = "reminder-sweep";
const HOLD_EXPIRY_QUEUE = "hold-expiry";

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

/** Fire-and-forget from the booking routes: a failed enqueue must never
 * fail the booking itself, so this logs instead of throwing. */
export async function enqueueInviteEmail(bookingId: string, kind: InviteKind): Promise<void> {
  try {
    await getBoss().send(INVITE_QUEUE, { bookingId, kind }, { retryLimit: 5, retryDelay: 60, retryBackoff: true });
  } catch (e) {
    console.error(`[jobs] enqueue invite ${kind} for ${bookingId} failed:`, e);
  }
}

/** Fire-and-forget from the booking routes, same contract as
 * enqueueInviteEmail: a failed enqueue must never fail the booking. */
export async function emitBookingWebhook(
  bookingId: string,
  kind: BookingWebhookKind,
  opts?: { reason?: string },
): Promise<void> {
  try {
    await getBoss().send(WEBHOOK_FANOUT_QUEUE, { bookingId, kind, reason: opts?.reason }, {
      retryLimit: 3,
      retryDelay: 30,
    });
  } catch (e) {
    console.error(`[jobs] enqueue webhook fan-out ${kind} for ${bookingId} failed:`, e);
  }
}

export async function enqueueSuggestionEmail(suggestionId: string): Promise<void> {
  try {
    await getBoss().send(SUGGESTION_EMAIL_QUEUE, { suggestionId }, {
      retryLimit: 5, retryDelay: 60, retryBackoff: true,
    });
  } catch (e) {
    console.error(`[jobs] enqueue suggestion email for ${suggestionId} failed:`, e);
  }
}

export async function emitSuggestionWebhook(suggestionId: string): Promise<void> {
  try {
    await getBoss().send(WEBHOOK_FANOUT_QUEUE, { suggestionId }, {
      retryLimit: 3, retryDelay: 30,
    });
  } catch (e) {
    console.error(`[jobs] enqueue suggestion webhook for ${suggestionId} failed:`, e);
  }
}

export async function enqueuePollFinalizationEmail(
  pollId: string,
  participantId?: string,
): Promise<void> {
  try {
    await getBoss().send(POLL_FINALIZATION_EMAIL_QUEUE, { pollId, participantId }, {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
    });
  } catch (e) {
    console.error(`[jobs] enqueue poll finalization for ${pollId} failed:`, e);
  }
}

export async function emitPollFinalizedWebhook(pollId: string): Promise<void> {
  try {
    await getBoss().send(WEBHOOK_FANOUT_QUEUE, { pollId }, {
      retryLimit: 3,
      retryDelay: 30,
    });
  } catch (e) {
    console.error(`[jobs] enqueue poll webhook for ${pollId} failed:`, e);
  }
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
  await b.createQueue(INVITE_QUEUE);
  await b.createQueue(SUGGESTION_EMAIL_QUEUE);
  await b.createQueue(POLL_FINALIZATION_EMAIL_QUEUE);

  await b.work<{ connectionId: string; forceFull?: boolean }>(SYNC_QUEUE, async ([job]) => {
    if (job) await runSync(job.data.connectionId, job.data.forceFull ?? false);
  });

  await b.work<{ bookingId: string; kind: InviteKind }>(INVITE_QUEUE, async ([job]) => {
    if (!job) return;
    if (job.data.kind === "reminder") await sendReminder(job.data.bookingId);
    else await sendInvite(job.data.bookingId, job.data.kind);
  });
  await b.work<{ suggestionId: string }>(SUGGESTION_EMAIL_QUEUE, async ([job]) => {
    if (job) await sendSuggestionEmail(job.data.suggestionId);
  });
  await b.work<{ pollId: string; participantId?: string }>(
    POLL_FINALIZATION_EMAIL_QUEUE,
    async ([job]) => {
      if (job) await sendPollFinalization(job.data.pollId, job.data.participantId);
    },
  );

  await b.createQueue(WEBHOOK_FANOUT_QUEUE);
  await b.createQueue(WEBHOOK_DELIVERY_QUEUE);

  await b.work<
    | { bookingId: string; kind: BookingWebhookKind; reason?: string }
    | { suggestionId: string }
    | { pollId: string }
  >(
    WEBHOOK_FANOUT_QUEUE,
    async ([job]) => {
      if (!job) return;
      const deliveries = "suggestionId" in job.data
        ? await fanOutSuggestionWebhooks(job.data.suggestionId)
        : "pollId" in job.data
          ? await fanOutPollWebhooks(job.data.pollId)
          : await fanOutBookingWebhooks(job.data.bookingId, job.data.kind, {
              reason: job.data.reason,
            });
      for (const delivery of deliveries) {
        await b.send(WEBHOOK_DELIVERY_QUEUE, delivery, {
          retryLimit: 8,
          retryDelay: 30,
          retryBackoff: true,
        });
      }
    },
  );

  await b.work<DeliveryJob>(
    WEBHOOK_DELIVERY_QUEUE,
    { includeMetadata: true },
    async ([job]) => {
      if (job) {
        await deliverWebhook(job.data, {
          retryCount: job.retryCount,
          retryLimit: job.retryLimit,
        });
      }
    },
  );

  await b.createQueue(REMINDER_SWEEP_QUEUE);
  await b.work(REMINDER_SWEEP_QUEUE, async () => {
    for (const bookingId of await listBookingsNeedingReminder(Temporal.Now.instant(), REMINDER_LEAD)) {
      await b.send(
        INVITE_QUEUE,
        { bookingId, kind: "reminder" satisfies InviteKind },
        {
          retryLimit: 5,
          retryDelay: 60,
          retryBackoff: true,
          // one queued reminder per booking even when sweeps overlap; once it
          // completes, the reminder_sent event keeps later sweeps away
          singletonKey: `reminder:${bookingId}`,
        },
      );
    }
  });
  await b.schedule(REMINDER_SWEEP_QUEUE, "*/5 * * * *");

  await b.createQueue(HOLD_EXPIRY_QUEUE);
  await b.work(HOLD_EXPIRY_QUEUE, async () => {
    const now = Temporal.Now.instant();
    const released = await expireHolds(now);
    await reapRateLimits(now.subtract({ seconds: 60 }));
    if (released > 0) console.log(`[jobs] hold-expiry: released ${released} hold(s)`);
  });
  await b.schedule(HOLD_EXPIRY_QUEUE, "*/5 * * * *");

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

  // initial sweeps so a fresh boot syncs, reminds, and expires immediately
  await b.send(SWEEP_QUEUE, {});
  await b.send(REMINDER_SWEEP_QUEUE, {});
  await b.send(HOLD_EXPIRY_QUEUE, {});
  console.log("[jobs] pg-boss started");
}

import { Temporal } from "@js-temporal/polyfill";
import { getInviteContext } from "../db/booking-repo";
import { getTimeSuggestionContext } from "../db/suggestion-repo";
import {
  createWebhookDelivery,
  getWebhook,
  listActiveWebhooks,
  recordWebhookDeliveryAttempt,
  type WebhookRow,
} from "../db/webhook-repo";
import {
  buildWebhookBody,
  buildSuggestionWebhookBody,
  matchesSubscription,
  type WebhookEventKind,
} from "../core/webhook/payload";
import { signWebhook } from "../core/webhook/signature";

// Two-stage emission (mirrors invite-email's snapshot semantics):
//   fan-out   loads the booking once, builds the canonical body per matching
//             endpoint, enqueues one delivery job each — so a slow endpoint
//             never delays another, and retries POST identical bytes.
//   delivery  signs (fresh timestamp per attempt) and POSTs; any non-2xx or
//             network failure throws so pg-boss retries with backoff.

export type BookingWebhookKind =
  | "created"
  | "rescheduled"
  | "cancelled"
  | "reassigned"
  | "no_show"
  | "invite_sent"
  | "invite_delivered"
  | "invite_failed"
  | "reminder_sent";

const EVENT_NAME: Record<BookingWebhookKind, WebhookEventKind> = {
  created: "booking.created",
  rescheduled: "booking.rescheduled",
  cancelled: "booking.cancelled",
  reassigned: "booking.reassigned",
  no_show: "booking.no_show",
  invite_sent: "booking.invite_sent",
  invite_delivered: "booking.invite_delivered",
  invite_failed: "booking.invite_failed",
  reminder_sent: "booking.reminder_sent",
};

export interface DeliveryJob {
  webhookId: string;
  deliveryId: string;
  event: WebhookEventKind;
  body: string;
}

export async function fanOutSuggestionWebhooks(
  suggestionId: string,
  deps: FanOutDeps = defaultFanOutDeps,
): Promise<DeliveryJob[]> {
  const event = "suggestion.created" as const;
  const ctx = await getTimeSuggestionContext(suggestionId);
  if (!ctx) return [];
  const hooks = (await deps.listActiveWebhooks(ctx.workspaceId))
    .filter((h) => matchesSubscription(h.events, event));
  if (hooks.length === 0) return [];
  const occurredAt = deps.now();
  return Promise.all(hooks.map(async (hook) => {
    const deliveryId = deps.deliveryId();
    await deps.createWebhookDelivery({ id: deliveryId, webhookId: hook.id, event });
    return {
      webhookId: hook.id,
      deliveryId,
      event,
      body: buildSuggestionWebhookBody({
        deliveryId,
        occurredAt,
        suggestion: {
          suggestionId: ctx.id,
          eventType: ctx.eventType,
          invitee: { email: ctx.inviteeEmail, name: ctx.inviteeName, timezone: ctx.inviteeTimezone },
          proposedSlots: ctx.proposedSlots.map((slot) => ({
            start: Temporal.Instant.from(slot.start),
            end: Temporal.Instant.from(slot.end),
          })),
          ...(ctx.message !== undefined && { message: ctx.message }),
        },
      }),
    };
  }));
}

export interface FanOutDeps {
  readonly listActiveWebhooks: (workspaceId?: string) => Promise<WebhookRow[]>;
  readonly getInviteContext: typeof getInviteContext;
  readonly createWebhookDelivery: typeof createWebhookDelivery;
  readonly now: () => Temporal.Instant;
  readonly deliveryId: () => string;
}

const defaultFanOutDeps: FanOutDeps = {
  listActiveWebhooks: (workspaceId) => listActiveWebhooks(undefined, workspaceId),
  getInviteContext: (bookingId) => getInviteContext(bookingId),
  createWebhookDelivery: (input) => createWebhookDelivery(input),
  now: () => Temporal.Now.instant(),
  deliveryId: () => crypto.randomUUID(),
};

/** Builds one delivery job per active, matching endpoint. Exported for tests
 * and reused by the fan-out worker. */
export async function fanOutBookingWebhooks(
  bookingId: string,
  kind: BookingWebhookKind,
  opts?: { reason?: string },
  deps: FanOutDeps = defaultFanOutDeps,
): Promise<DeliveryJob[]> {
  const event = EVENT_NAME[kind];
  const ctx = await deps.getInviteContext(bookingId);
  if (!ctx) {
    console.error(`[jobs] webhook fan-out: booking ${bookingId} not found`);
    return [];
  }
  const hooks = (await deps.listActiveWebhooks(ctx.workspaceId))
    .filter((h) => matchesSubscription(h.events, event));
  if (hooks.length === 0) return [];

  const occurredAt = deps.now();
  return Promise.all(hooks.map(async (hook) => {
    const deliveryId = deps.deliveryId();
    await deps.createWebhookDelivery({ id: deliveryId, webhookId: hook.id, event });
    return {
      webhookId: hook.id,
      deliveryId,
      event,
      body: buildWebhookBody({
        deliveryId,
        event,
        occurredAt,
        booking: {
          bookingId: ctx.booking.id,
          eventType: {
            id: ctx.booking.eventTypeId,
            slug: ctx.eventTypeSlug,
            title: ctx.eventTypeTitle,
          },
          start: ctx.booking.startsAt,
          end: ctx.booking.endsAt,
          status: ctx.booking.status,
          invitee: {
            email: ctx.booking.inviteeEmail,
            name: ctx.booking.inviteeName,
            timezone: ctx.booking.inviteeTimezone,
          },
          hosts: ctx.hosts.map((h) => ({ id: h.id, name: h.name, email: h.email })),
          ...(opts?.reason !== undefined && { reason: opts.reason }),
        },
      }),
    };
  }));
}

const DELIVERY_TIMEOUT_MS = 10_000;

export interface DeliveryDeps {
  readonly getWebhook: typeof getWebhook;
  readonly recordAttempt: typeof recordWebhookDeliveryAttempt;
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly nowMs: () => number;
}

const defaultDeliveryDeps: DeliveryDeps = {
  getWebhook: (id) => getWebhook(id),
  recordAttempt: (id, outcome) => recordWebhookDeliveryAttempt(id, outcome),
  fetch: (input, init) => fetch(input, init),
  nowMs: () => Date.now(),
};

export async function deliverWebhook(
  job: DeliveryJob,
  attempt: { retryCount: number; retryLimit: number } = { retryCount: 0, retryLimit: 0 },
  deps: DeliveryDeps = defaultDeliveryDeps,
): Promise<void> {
  const hook = await deps.getWebhook(job.webhookId);
  if (!hook || !hook.active) return; // deleted/disabled since fan-out: drop silently

  const exhausted = attempt.retryCount >= attempt.retryLimit;
  try {
    const signature = signWebhook(hook.secret, Math.floor(deps.nowMs() / 1000), job.body);
    const res = await deps.fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "calpaca-webhook/1.0",
        "x-webhook-id": hook.id,
        "x-webhook-delivery": job.deliveryId,
        "x-webhook-event": job.event,
        "x-webhook-signature": signature,
      },
      body: job.body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    await res.arrayBuffer().catch(() => undefined);
    if (!res.ok) {
      const message = `HTTP ${res.status}`;
      await deps.recordAttempt(job.deliveryId, {
        delivered: false,
        exhausted,
        httpStatus: res.status,
        error: message,
      });
      throw new Error(`webhook ${hook.id} delivery ${job.deliveryId}: ${message}`);
    }
    await deps.recordAttempt(job.deliveryId, {
      delivered: true,
      exhausted: false,
      httpStatus: res.status,
    });
  } catch (error) {
    if (error instanceof Error && /^webhook .*: HTTP \d+$/.test(error.message)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await deps.recordAttempt(job.deliveryId, {
      delivered: false,
      exhausted,
      error: message,
    });
    throw error;
  }
  console.log(`[jobs] webhook ${hook.id} delivered ${job.event} (${job.deliveryId})`);
}

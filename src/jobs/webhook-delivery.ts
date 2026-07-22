import { Temporal } from "@js-temporal/polyfill";
import { getInviteContext } from "../db/booking-repo";
import { listActiveWebhooks, getWebhook } from "../db/webhook-repo";
import {
  buildWebhookBody,
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

export type BookingWebhookKind = "created" | "rescheduled" | "cancelled";

const EVENT_NAME: Record<BookingWebhookKind, WebhookEventKind> = {
  created: "booking.created",
  rescheduled: "booking.rescheduled",
  cancelled: "booking.cancelled",
};

export interface DeliveryJob {
  webhookId: string;
  deliveryId: string;
  event: WebhookEventKind;
  body: string;
}

/** Builds one delivery job per active, matching endpoint. Exported for tests
 * and reused by the fan-out worker. */
export async function fanOutBookingWebhooks(
  bookingId: string,
  kind: BookingWebhookKind,
  opts?: { reason?: string },
): Promise<DeliveryJob[]> {
  const event = EVENT_NAME[kind];
  const hooks = (await listActiveWebhooks()).filter((h) => matchesSubscription(h.events, event));
  if (hooks.length === 0) return [];

  const ctx = await getInviteContext(bookingId);
  if (!ctx) {
    console.error(`[jobs] webhook fan-out: booking ${bookingId} not found`);
    return [];
  }

  const occurredAt = Temporal.Now.instant();
  return hooks.map((hook) => {
    const deliveryId = crypto.randomUUID();
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
  });
}

const DELIVERY_TIMEOUT_MS = 10_000;

export async function deliverWebhook(job: DeliveryJob): Promise<void> {
  const hook = await getWebhook(job.webhookId);
  if (!hook || !hook.active) return; // deleted/disabled since fan-out: drop silently

  const signature = signWebhook(hook.secret, Math.floor(Date.now() / 1000), job.body);
  const res = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "scheduling-platform-webhook/1.0",
      "x-webhook-id": hook.id,
      "x-webhook-delivery": job.deliveryId,
      "x-webhook-event": job.event,
      "x-webhook-signature": signature,
    },
    body: job.body,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  // drain so the connection can be reused; consumers' response bodies are ignored
  await res.arrayBuffer().catch(() => undefined);
  if (!res.ok) {
    throw new Error(`webhook ${hook.id} delivery ${job.deliveryId}: HTTP ${res.status}`);
  }
  console.log(`[jobs] webhook ${hook.id} delivered ${job.event} (${job.deliveryId})`);
}

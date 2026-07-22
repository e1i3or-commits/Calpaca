import { Hono } from "hono";
import { z } from "zod";
import type { Result } from "../../lib/result";
import type { BookingStateError } from "../../core/booking/state";
import { getConnectionByChannelId } from "../../db/sync-repo";
import { appendEvent } from "../../db/booking-repo";
import { enqueueSync } from "../../jobs/index";

// Google Calendar push notifications. Bodyless POSTs; everything relevant
// is in headers. Always 200 — non-2xx makes Google retry with backoff, and
// an attacker learns nothing from a uniform response.
export const webhookRoutes = new Hono();

webhookRoutes.post("/api/webhooks/google-calendar", async (c) => {
  const channelId = c.req.header("x-goog-channel-id");
  const channelToken = c.req.header("x-goog-channel-token");
  const state = c.req.header("x-goog-resource-state");

  if (!channelId || !channelToken) return c.json({ ok: true });

  const conn = await getConnectionByChannelId(channelId);
  if (!conn || conn.channelToken !== channelToken) {
    console.warn(`[webhook] push for unknown/mismatched channel ${channelId}`);
    return c.json({ ok: true });
  }

  // "sync" is the channel-created handshake, not a data change
  if (state !== "sync") await enqueueSync(conn.id);
  return c.json({ ok: true });
});

// Normalized email delivery feedback. The app itself never integrates a mail
// provider's notification format (extension boundary: webhooks + n8n) — an
// n8n flow receives the provider's bounce/delivery event, pulls the booking
// id out of the original Message-ID (`<uuid.bookingId@scheduling-platform>`,
// set in src/jobs/invite-email.ts), and posts the normalized form here.
const emailDeliveryBodySchema = z.object({
  bookingId: z.string().uuid(),
  status: z.enum(["delivered", "bounced"]),
  reason: z.string().max(500).optional(),
});

export interface EmailDeliveryDeps {
  readonly appendInviteEvent: (
    bookingId: string,
    kind: "invite_delivered" | "invite_failed",
    payload: { reason?: string },
  ) => Promise<Result<unknown, BookingStateError>>;
  /** Read per request so rotation doesn't need a restart. */
  readonly secret: () => string | undefined;
}

/** Constant-time bearer check; hashing first sidesteps timingSafeEqual's
 * equal-length requirement. */
function bearerMatches(header: string | undefined, secret: string): boolean {
  const presented = header?.replace(/^Bearer /, "");
  if (!presented) return false;
  const digest = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest();
  return crypto.timingSafeEqual(digest(presented), digest(secret));
}

export function createEmailDeliveryRoutes(deps: EmailDeliveryDeps): Hono {
  const routes = new Hono();

  routes.post("/api/webhooks/email-delivery", async (c) => {
    const secret = deps.secret();
    // unset secret means the feature is off — indistinguishable from no route
    if (!secret) return c.json({ error: "not_found" }, 404);
    if (!bearerMatches(c.req.header("authorization"), secret)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const parsed = emailDeliveryBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const { bookingId, status, reason } = parsed.data;

    const result =
      status === "delivered"
        ? await deps.appendInviteEvent(bookingId, "invite_delivered", {})
        : await deps.appendInviteEvent(bookingId, "invite_failed", { reason: reason ?? "bounced" });

    if (result.ok) return c.json({ recorded: true });
    if (result.error.reason === "not_created") return c.json({ error: "unknown_booking" }, 404);
    // duplicate notification, cancelled booking, feedback without a send —
    // acknowledged but not recorded, so the sender does not retry forever
    return c.json({ recorded: false, reason: result.error.reason });
  });

  return routes;
}

webhookRoutes.route(
  "/",
  createEmailDeliveryRoutes({
    appendInviteEvent: (bookingId, kind, payload) => appendEvent(bookingId, kind, payload),
    secret: () => process.env.EMAIL_DELIVERY_WEBHOOK_SECRET,
  }),
);

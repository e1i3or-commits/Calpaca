import { Hono } from "hono";
import { getConnectionByChannelId } from "../../db/sync-repo";
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

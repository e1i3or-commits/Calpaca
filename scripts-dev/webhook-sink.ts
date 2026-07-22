// Dev-only webhook receiver: accepts every delivery, verifies the signature
// when WEBHOOK_SINK_SECRET is set, and logs the payload. Pair with a webhook
// registered at http://127.0.0.1:9999/hook.
//
//   WEBHOOK_SINK_SECRET=whsec_... bun run scripts-dev/webhook-sink.ts

import { verifyWebhookSignature } from "../src/core/webhook/signature";

const PORT = Number(process.env.WEBHOOK_SINK_PORT ?? 9999);
const SECRET = process.env.WEBHOOK_SINK_SECRET;

let count = 0;

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const body = await req.text();
    count += 1;
    const sig = req.headers.get("x-webhook-signature") ?? "";
    const verdict = !SECRET
      ? "unverified (WEBHOOK_SINK_SECRET unset)"
      : verifyWebhookSignature({
            secret: SECRET,
            header: sig,
            body,
            nowSeconds: Math.floor(Date.now() / 1000),
          })
        ? "signature VALID"
        : "signature INVALID";
    console.log(
      `[webhook-sink] #${count} ${req.headers.get("x-webhook-event")} delivery=${req.headers.get("x-webhook-delivery")} ${verdict}`,
    );
    console.log(`[webhook-sink] body: ${body}`);
    return Response.json({ ok: true });
  },
});

console.log(`[webhook-sink] listening on http://127.0.0.1:${PORT}`);

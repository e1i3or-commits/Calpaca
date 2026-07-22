import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe-style webhook signatures: `t=<unix seconds>,v1=<hex hmac>` where the
// HMAC-SHA256 is computed over `${t}.${body}` with the endpoint's secret.
// Deterministic computation only — the caller supplies the timestamp.

export function signWebhook(secret: string, timestampSeconds: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

/**
 * Verifies a signature header against the raw body. `nowSeconds` is passed
 * in (no clock access in core); signatures older than `toleranceSeconds`
 * are rejected to bound replay windows. This is the reference for what
 * consumers (n8n function nodes etc.) should implement.
 */
export function verifyWebhookSignature(args: {
  secret: string;
  header: string;
  body: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(args.header);
  if (!match) return false;
  const t = Number(match[1]);
  if (Math.abs(args.nowSeconds - t) > (args.toleranceSeconds ?? 300)) return false;

  const expected = createHmac("sha256", args.secret).update(`${t}.${args.body}`).digest();
  const given = Buffer.from(match[2]!, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

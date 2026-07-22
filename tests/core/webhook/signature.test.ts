import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { signWebhook, verifyWebhookSignature } from "../../../src/core/webhook/signature";

const SECRET = "whsec_test";
const BODY = '{"event":"booking.created"}';
const NOW = 1_784_736_000;

describe("signWebhook", () => {
  test("produces t=,v1= over `${t}.${body}`", () => {
    const expected = createHmac("sha256", SECRET).update(`${NOW}.${BODY}`).digest("hex");
    expect(signWebhook(SECRET, NOW, BODY)).toBe(`t=${NOW},v1=${expected}`);
  });
});

describe("verifyWebhookSignature", () => {
  const header = signWebhook(SECRET, NOW, BODY);

  test("round-trips a valid signature", () => {
    expect(verifyWebhookSignature({ secret: SECRET, header, body: BODY, nowSeconds: NOW })).toBe(true);
  });

  test("rejects a tampered body, wrong secret, and malformed header", () => {
    expect(verifyWebhookSignature({ secret: SECRET, header, body: BODY + " ", nowSeconds: NOW })).toBe(false);
    expect(verifyWebhookSignature({ secret: "other", header, body: BODY, nowSeconds: NOW })).toBe(false);
    expect(verifyWebhookSignature({ secret: SECRET, header: "v1=abc", body: BODY, nowSeconds: NOW })).toBe(false);
  });

  test("rejects signatures outside the replay tolerance", () => {
    expect(
      verifyWebhookSignature({ secret: SECRET, header, body: BODY, nowSeconds: NOW + 301 }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({ secret: SECRET, header, body: BODY, nowSeconds: NOW + 299 }),
    ).toBe(true);
  });
});

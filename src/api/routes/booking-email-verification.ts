import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { getEventTypeBySlug } from "../../db/availability-repo";
import {
  createBookingEmailVerification,
  getActiveBookingEmailChallenge,
  verifyBookingEmailCode,
} from "../../db/booking-email-verification-repo";
import { incrementRateLimit } from "../../db/rate-limit-repo";
import { bucketStart, decide } from "../../core/ratelimit/window";
import { createRateLimitMiddleware } from "../rate-limit";
import { publicWorkspaceId } from "../public-workspace";
import { isMailerConfigured, sendInviteMail } from "../../notifications/mailer";

const requestSchema = z.object({
  eventTypeSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
  email: z.string().trim().email().max(320),
});
const verifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});
const now = () => Temporal.Now.instant();
const checkRateLimit = async (key: string, instant: Temporal.Instant, limit: number, seconds: number) => {
  const bucket = bucketStart(instant, seconds);
  const count = await incrementRateLimit(key, bucket);
  return decide(
    count,
    limit,
    instant.until(bucket.add({ seconds })).total({ unit: "seconds" }),
  );
};

const router = new Hono();
router.use(
  "/booking-email-verifications/request",
  createRateLimitMiddleware({
    now,
    checkRateLimit,
  }, {
    scope: "booking-email-verification",
    envName: "EMAIL_VERIFICATION_RATE_LIMIT",
    defaultLimit: 5,
  }),
);

router.post("/booking-email-verifications/request", async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const workspaceId = await publicWorkspaceId(c, parsed.data.workspaceSlug);
  const eventType = workspaceId
    ? await getEventTypeBySlug(parsed.data.eventTypeSlug, undefined, workspaceId)
    : null;
  let challengeId: string = randomUUID();
  const emailKey = createHash("sha256")
    .update(parsed.data.email.trim().toLowerCase())
    .digest("hex");
  const emailLimit = await checkRateLimit(
    `booking-email-verification-address:${emailKey}`,
    now(),
    1,
    60,
  );
  if (eventType?.emailVerificationRequired && !emailLimit.allowed) {
    challengeId = await getActiveBookingEmailChallenge(eventType.id, parsed.data.email)
      ?? challengeId;
  }
  if (eventType?.emailVerificationRequired && isMailerConfigured() && emailLimit.allowed) {
    const challenge = await createBookingEmailVerification(eventType.id, parsed.data.email);
    challengeId = challenge.id;
    try {
      await sendInviteMail({
        to: parsed.data.email,
        subject: "Your Calpaca verification code",
        text: `Your verification code is ${challenge.code}. It expires in 10 minutes.`,
        html: `<!doctype html><html lang="en"><body style="font-family:Arial,Helvetica,sans-serif;color:#24221f"><h1 style="font-size:22px">Verify your email</h1><p>Enter this code to continue booking:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${challenge.code}</p><p style="color:#706b63;font-size:13px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></body></html>`,
      });
    } catch (error) {
      console.error("[email-verification] delivery failed:", error);
    }
  }
  return c.json({
    challengeId,
    message: "If verification is available, a code has been sent.",
  }, 202);
});

router.post("/booking-email-verifications/verify", async (c) => {
  const parsed = verifySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_verification" }, 400);
  const result = await verifyBookingEmailCode(parsed.data.challengeId, parsed.data.code);
  return result
    ? c.json({ verificationToken: result.receipt })
    : c.json({ error: "invalid_verification" }, 400);
});

export const bookingEmailVerificationRoutes = router;

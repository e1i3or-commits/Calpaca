import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import { isIanaZone } from "../../lib/timezone";
import {
  cancelSignupRegistrations,
  createSignupSheet,
  getPublicSignupSheet,
  listSignupSheets,
  registerForSignupSessions,
  type SignupSheetRecord,
} from "../../db/signup-sheet-repo";
import { enqueueSignupConfirmation } from "../../jobs/index";
import { createRateLimitMiddleware } from "../rate-limit";
import { incrementRateLimit } from "../../db/rate-limit-repo";
import { bucketStart, decide } from "../../core/ratelimit/window";

const sessionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  capacity: z.number().int().min(1).max(500),
});
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().refine(isIanaZone),
  maxRegistrationsPerPerson: z.number().int().min(1).max(50),
  questions: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(200),
    required: z.boolean(),
  })).max(20),
  sessions: z.array(sessionSchema).min(1).max(100),
}).refine(
  (sheet) => new Set(sheet.questions.map((question) => question.id)).size === sheet.questions.length,
  { message: "question ids must be unique", path: ["questions"] },
);
const registrationSchema = z.object({
  sessionIds: z.array(z.string().uuid()).min(1).max(50),
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
  answers: z.record(z.string().max(2000)).default({}),
});

function renderSheet(sheet: SignupSheetRecord, ownerView: boolean) {
  return {
    id: sheet.id,
    publicId: sheet.publicId,
    title: sheet.title,
    description: sheet.description,
    timezone: sheet.timezone,
    status: sheet.status,
    maxRegistrationsPerPerson: sheet.maxRegistrationsPerPerson,
    questions: sheet.questions,
    sessions: sheet.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      description: session.description,
      start: session.startsAt.toISOString(),
      end: session.endsAt.toISOString(),
      capacity: session.capacity,
      registrationCount: session.registrationCount,
      seatsRemaining: Math.max(0, session.capacity - session.registrationCount),
      ...(ownerView ? { registrations: session.registrations } : {}),
    })),
  };
}

export function createSignupSheetRoutes(): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.use("/api/me/signup-sheets", requireSession);
  routes.use("/api/me/signup-sheets/*", requireSession);
  routes.use("/signup-sheets/*/registrations", createRateLimitMiddleware({
    now: () => Temporal.Now.instant(),
    checkRateLimit: async (key, now, limit, windowSeconds) => {
      const bucket = bucketStart(now, windowSeconds);
      const current = await incrementRateLimit(key, bucket);
      return decide(
        current,
        limit,
        now.until(bucket.add({ seconds: windowSeconds })).total({ unit: "seconds" }),
      );
    },
  }, {
    scope: "signup-registrations",
    envName: "RATE_LIMIT_SIGNUP_REGISTRATIONS_PER_MINUTE",
    defaultLimit: 10,
  }));

  routes.get("/api/me/signup-sheets", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ sheets: [] });
    const sheets = await listSignupSheets(workspaceId);
    return c.json({ sheets: sheets.map((sheet) => renderSheet(sheet, true)) });
  });

  routes.post("/api/me/signup-sheets", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const user = c.get("user");
    if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const now = Date.now();
    const sessions = parsed.data.sessions.map((session) => ({
      title: session.title,
      description: session.description,
      startsAt: new Date(session.start),
      endsAt: new Date(session.end),
      capacity: session.capacity,
    }));
    if (sessions.some(
      (session) =>
        session.startsAt.getTime() <= now
        || session.endsAt.getTime() <= session.startsAt.getTime(),
    )) return c.json({ error: "invalid_sessions" }, 400);
    const sheet = await createSignupSheet({
      workspaceId: user.workspaceId,
      ownerUserId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      timezone: parsed.data.timezone,
      maxRegistrationsPerPerson: parsed.data.maxRegistrationsPerPerson,
      questions: parsed.data.questions,
      sessions,
    });
    return c.json(renderSheet(sheet, true), 201);
  });

  routes.get("/signup-sheets/:publicId", async (c) => {
    const sheet = await getPublicSignupSheet(c.req.param("publicId"));
    return sheet
      ? c.json(renderSheet(sheet, false))
      : c.json({ error: "signup_sheet_not_found" }, 404);
  });

  routes.post("/signup-sheets/:publicId/registrations", async (c) => {
    const parsed = registrationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const result = await registerForSignupSessions({
      publicId: c.req.param("publicId"),
      ...parsed.data,
    });
    if (result === "not_found") return c.json({ error: "signup_sheet_not_found" }, 404);
    if (result === "closed") return c.json({ error: "signup_sheet_closed" }, 409);
    if (
      result === "invalid_sessions"
      || result === "invalid_answers"
      || result === "missing_answers"
    ) {
      return c.json({ error: result }, 400);
    }
    if (
      result === "registration_limit"
      || result === "session_full"
      || result === "already_registered"
    ) return c.json({ error: result }, 409);
    await enqueueSignupConfirmation(result.registrationIds);
    return c.json(result, 201);
  });

  routes.post("/signup-registrations/cancel", async (c) => {
    const parsed = z.object({ token: z.string().min(20) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const cancelled = await cancelSignupRegistrations(parsed.data.token);
    return cancelled
      ? c.json({ status: "cancelled" as const })
      : c.json({ error: "registration_not_found" }, 404);
  });

  return routes;
}

export const signupSheetRoutes = createSignupSheetRoutes();

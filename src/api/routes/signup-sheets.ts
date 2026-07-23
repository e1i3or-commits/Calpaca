import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import { isIanaZone } from "../../lib/timezone";
import {
  cancelSignupRegistrationByOrganizer,
  cancelSignupRegistrations,
  createSignupSheet,
  getPublicSignupSheet,
  getSignupRegistrationForResend,
  getSignupSheetForWorkspace,
  listSignupSheets,
  markSignupConfirmationPending,
  registerForSignupSessions,
  type SignupSheetRecord,
  updateSignupSheetAdministration,
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
const administrationSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  rosterVisibility: z.enum(["hidden", "counts", "names"]).optional(),
  capacities: z.array(z.object({
    sessionId: z.string().uuid(),
    capacity: z.number().int().min(1).max(500),
  })).max(100).optional(),
}).refine(
  (input) => input.status || input.rosterVisibility || input.capacities?.length,
  { message: "at least one change is required" },
);

function renderSheet(sheet: SignupSheetRecord, ownerView: boolean) {
  return {
    id: sheet.id,
    publicId: sheet.publicId,
    title: sheet.title,
    description: sheet.description,
    timezone: sheet.timezone,
    status: sheet.status,
    rosterVisibility: sheet.rosterVisibility,
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
      overCapacity: session.registrationCount > session.capacity,
      ...((ownerView || sheet.rosterVisibility === "names")
        ? { registrations: session.registrations }
        : {}),
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

  routes.patch("/api/me/signup-sheets/:id", async (c) => {
    const parsed = administrationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "signup_sheet_not_found" }, 404);
    const sheet = await updateSignupSheetAdministration({
      workspaceId,
      sheetId: c.req.param("id"),
      ...parsed.data,
    });
    return sheet
      ? c.json(renderSheet(sheet, true))
      : c.json({ error: "signup_sheet_not_found" }, 404);
  });

  routes.delete("/api/me/signup-sheets/:id/registrations/:registrationId", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "registration_not_found" }, 404);
    const cancelled = await cancelSignupRegistrationByOrganizer({
      workspaceId,
      sheetId: c.req.param("id"),
      registrationId: c.req.param("registrationId"),
    });
    return cancelled
      ? c.json({ status: "cancelled" as const })
      : c.json({ error: "registration_not_found" }, 404);
  });

  routes.post("/api/me/signup-sheets/:id/registrations/:registrationId/resend", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "registration_not_found" }, 404);
    const registrationIds = await getSignupRegistrationForResend({
      workspaceId,
      sheetId: c.req.param("id"),
      registrationId: c.req.param("registrationId"),
    });
    if (!registrationIds) return c.json({ error: "registration_not_found" }, 404);
    await markSignupConfirmationPending(registrationIds);
    await enqueueSignupConfirmation(registrationIds);
    return c.json({ status: "pending" as const });
  });

  routes.get("/api/me/signup-sheets/:id/registrations.csv", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "signup_sheet_not_found" }, 404);
    const sheet = await getSignupSheetForWorkspace(workspaceId, c.req.param("id"));
    if (!sheet) return c.json({ error: "signup_sheet_not_found" }, 404);
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const headers = [
      "session", "start", "end", "name", "email", "status", "confirmation",
      ...sheet.questions.map((question) => question.label),
    ];
    const rows = sheet.sessions.flatMap((session) => (session.registrations ?? []).map(
      (registration) => [
        session.title,
        session.startsAt.toISOString(),
        session.endsAt.toISOString(),
        registration.name,
        registration.email,
        registration.status,
        registration.confirmationError
          ? `failed: ${registration.confirmationError}`
          : registration.confirmationSentAt ? "sent" : "pending",
        ...sheet.questions.map((question) => registration.answers[question.id] ?? ""),
      ],
    ));
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="signup-${sheet.publicId}.csv"`);
    return c.body(csv);
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

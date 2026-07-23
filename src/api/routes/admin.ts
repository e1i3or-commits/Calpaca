import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import { themeNames } from "../../core/theming/themes";
import {
  addTeamMember,
  createEventType,
  createSchedule,
  createTeam,
  deleteEventType,
  deleteSchedule,
  getEventTypeForAdmin,
  isTeamMember,
  listEventTypesForUser,
  listSchedulesForUser,
  listTeamMembers,
  listTeamsForUser,
  listUsers,
  removeTeamMember,
  updateEventType,
  updateSchedule,
  type AdminEventType,
  type DirectoryUser,
  type EventTypeInput,
  type ScheduleRecord,
  type ScheduleRule,
  type TeamMemberRecord,
  type TeamRecord,
} from "../../db/admin-repo";

/** The dashboard settings surface: event types, schedules, teams, and the
 * user directory behind the people picker. Same injected-deps convention as
 * the other route modules. */
export interface AdminDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly listUsers: () => Promise<DirectoryUser[]>;
  readonly listSchedulesForUser: (userId: string) => Promise<ScheduleRecord[]>;
  readonly createSchedule: (input: {
    userId: string;
    name: string;
    timezone: string;
    rules: ScheduleRule[];
  }) => Promise<ScheduleRecord>;
  readonly updateSchedule: (
    id: string,
    userId: string,
    patch: Partial<{ name: string; timezone: string; rules: ScheduleRule[] }>,
  ) => Promise<ScheduleRecord | null>;
  readonly deleteSchedule: (id: string, userId: string) => Promise<"deleted" | "not_found" | "in_use">;
  readonly listTeamsForUser: (userId: string) => Promise<TeamRecord[]>;
  readonly createTeam: (input: {
    name: string;
    slug: string;
    creatorUserId: string;
  }) => Promise<TeamRecord | "slug_taken">;
  readonly isTeamMember: (teamId: string, userId: string) => Promise<boolean>;
  readonly listTeamMembers: (teamId: string) => Promise<TeamMemberRecord[]>;
  readonly addTeamMember: (teamId: string, userId: string) => Promise<void>;
  readonly removeTeamMember: (teamId: string, userId: string) => Promise<boolean>;
  readonly listEventTypesForUser: (userId: string) => Promise<AdminEventType[]>;
  readonly getEventTypeForAdmin: (id: string, userId: string) => Promise<AdminEventType | null>;
  readonly createEventType: (
    ownerUserId: string,
    input: EventTypeInput,
  ) => Promise<AdminEventType | "slug_taken">;
  readonly updateEventType: (
    id: string,
    userId: string,
    input: EventTypeInput,
  ) => Promise<AdminEventType | null>;
  readonly deleteEventType: (id: string, userId: string) => Promise<"deleted" | "not_found" | "in_use">;
}

const defaultDeps: AdminDeps = {
  requireAuth: requireSession,
  listUsers: () => listUsers(),
  listSchedulesForUser: (userId) => listSchedulesForUser(userId),
  createSchedule: (input) => createSchedule(input),
  updateSchedule: (id, userId, patch) => updateSchedule(id, userId, patch),
  deleteSchedule: (id, userId) => deleteSchedule(id, userId),
  listTeamsForUser: (userId) => listTeamsForUser(userId),
  createTeam: (input) => createTeam(input),
  isTeamMember: (teamId, userId) => isTeamMember(teamId, userId),
  listTeamMembers: (teamId) => listTeamMembers(teamId),
  addTeamMember: (teamId, userId) => addTeamMember(teamId, userId),
  removeTeamMember: (teamId, userId) => removeTeamMember(teamId, userId),
  listEventTypesForUser: (userId) => listEventTypesForUser(userId),
  getEventTypeForAdmin: (id, userId) => getEventTypeForAdmin(id, userId),
  createEventType: (ownerUserId, input) => createEventType(ownerUserId, input),
  updateEventType: (id, userId, input) => updateEventType(id, userId, input),
  deleteEventType: (id, userId) => deleteEventType(id, userId),
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isIanaZone(tz: string): boolean {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(tz);
    return true;
  } catch {
    return false;
  }
}

const ruleSchema = z
  .object({
    dow: z.number().int().min(0).max(6),
    start: z.string().regex(HHMM_RE),
    end: z.string().regex(HHMM_RE),
  })
  .refine((r) => r.start < r.end, { message: "start must be before end" });

const scheduleBodySchema = z.object({
  name: z.string().min(1).max(100),
  timezone: z.string().refine(isIanaZone, "must be an IANA timezone"),
  rules: z.array(ruleSchema).max(50),
});

const eventTypeBodySchema = z
  .object({
    slug: z.string().min(1).max(80).regex(SLUG_RE, "kebab-case only"),
    title: z.string().min(1).max(200),
    durationMinutes: z.number().int().min(5).max(480),
    bufferBeforeMin: z.number().int().min(0).max(240),
    bufferAfterMin: z.number().int().min(0).max(240),
    minimumNoticeMin: z.number().int().min(0).max(10080),
    rollingWindowDays: z.number().int().min(1).max(90),
    mode: z.enum(["solo", "round_robin", "group"]),
    scheduleId: z.string().uuid().nullable(),
    teamId: z.string().uuid().nullable(),
    theme: z.enum(themeNames).default("default"),
    agentPolicy: z
      .object({
        enabled: z.boolean(),
        autoExpireHoldsMin: z.number().int().min(1).max(1440).optional(),
      })
      .optional(),
    hosts: z
      .array(
        z.object({
          userId: z.string().uuid(),
          role: z.enum(["member", "required", "optional"]),
          weight: z.number().int().min(1).max(1000),
        }),
      )
      .min(1, "at least one host")
      .max(50),
  })
  .refine((et) => et.mode !== "solo" || et.hosts.length === 1, {
    message: "solo event types have exactly one host",
  });

const teamBodySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(80).regex(SLUG_RE, "kebab-case only"),
});

const memberBodySchema = z.object({ userId: z.string().uuid() });

export function createAdminRoutes(deps: AdminDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  for (const path of ["/api/me/users", "/api/me/schedules", "/api/me/teams", "/api/me/event-types"]) {
    router.use(path, deps.requireAuth);
    router.use(`${path}/*`, deps.requireAuth);
  }

  // ---- directory ----

  router.get("/api/me/users", async (c) => {
    return c.json({ users: await deps.listUsers() });
  });

  // ---- schedules ----

  router.get("/api/me/schedules", async (c) => {
    return c.json({ schedules: await deps.listSchedulesForUser(c.get("user").id) });
  });

  router.post("/api/me/schedules", async (c) => {
    const parsed = scheduleBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const row = await deps.createSchedule({ userId: c.get("user").id, ...parsed.data });
    return c.json(row, 201);
  });

  router.put("/api/me/schedules/:id", async (c) => {
    const parsed = scheduleBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const row = await deps.updateSchedule(c.req.param("id"), c.get("user").id, parsed.data);
    if (!row) return c.json({ error: "schedule_not_found" }, 404);
    return c.json(row);
  });

  router.delete("/api/me/schedules/:id", async (c) => {
    const result = await deps.deleteSchedule(c.req.param("id"), c.get("user").id);
    if (result === "not_found") return c.json({ error: "schedule_not_found" }, 404);
    if (result === "in_use") return c.json({ error: "schedule_in_use" }, 409);
    return c.json({ ok: true });
  });

  // ---- teams ----

  router.get("/api/me/teams", async (c) => {
    return c.json({ teams: await deps.listTeamsForUser(c.get("user").id) });
  });

  router.post("/api/me/teams", async (c) => {
    const parsed = teamBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const result = await deps.createTeam({ ...parsed.data, creatorUserId: c.get("user").id });
    if (result === "slug_taken") return c.json({ error: "slug_taken" }, 409);
    return c.json(result, 201);
  });

  router.get("/api/me/teams/:id/members", async (c) => {
    const teamId = c.req.param("id");
    if (!(await deps.isTeamMember(teamId, c.get("user").id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    return c.json({ members: await deps.listTeamMembers(teamId) });
  });

  router.post("/api/me/teams/:id/members", async (c) => {
    const teamId = c.req.param("id");
    if (!(await deps.isTeamMember(teamId, c.get("user").id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const parsed = memberBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    await deps.addTeamMember(teamId, parsed.data.userId);
    return c.json({ ok: true }, 201);
  });

  router.delete("/api/me/teams/:id/members/:userId", async (c) => {
    const teamId = c.req.param("id");
    if (!(await deps.isTeamMember(teamId, c.get("user").id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const removed = await deps.removeTeamMember(teamId, c.req.param("userId"));
    if (!removed) return c.json({ error: "member_not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- event types ----

  router.get("/api/me/event-types", async (c) => {
    return c.json({ eventTypes: await deps.listEventTypesForUser(c.get("user").id) });
  });

  router.post("/api/me/event-types", async (c) => {
    const parsed = eventTypeBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    if (parsed.data.teamId && !(await deps.isTeamMember(parsed.data.teamId, user.id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const result = await deps.createEventType(user.id, parsed.data);
    if (result === "slug_taken") return c.json({ error: "slug_taken" }, 409);
    return c.json(result, 201);
  });

  router.put("/api/me/event-types/:id", async (c) => {
    const parsed = eventTypeBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    if (parsed.data.teamId && !(await deps.isTeamMember(parsed.data.teamId, user.id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const result = await deps.updateEventType(c.req.param("id"), user.id, parsed.data);
    if (!result) return c.json({ error: "event_type_not_found" }, 404);
    return c.json(result);
  });

  router.delete("/api/me/event-types/:id", async (c) => {
    const result = await deps.deleteEventType(c.req.param("id"), c.get("user").id);
    if (result === "not_found") return c.json({ error: "event_type_not_found" }, 404);
    if (result === "in_use") return c.json({ error: "event_type_in_use" }, 409);
    return c.json({ ok: true });
  });

  return router;
}

export const adminRoutes = createAdminRoutes();

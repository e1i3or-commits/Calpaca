import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  bookingLayoutNames,
  canUseTheme,
  publicThemeNames,
  themeLabels,
  themeNames,
} from "../../core/theming/themes";
import {
  addTeamMember,
  createEventType,
  createSchedule,
  createTeam,
  deleteEventType,
  deleteSchedule,
  getEventTypeForAdmin,
  isTeamMember,
  isTeamAdmin,
  isAppAdmin,
  listEventTypesForUser,
  listSchedulesForUser,
  listTeamMembers,
  listTeamsForUser,
  listUsers,
  removeTeamMember,
  updateTeamMemberAdmin,
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
import type { ScheduleOverride } from "../../core/availability/overrides";
import {
  getBookingDetailForUser,
  getAssignmentExplanationForUser,
  listBookingsForUser,
  markBookingNoShowForUser,
  type AdminBookingDetail,
  type AdminBookingPage,
} from "../../db/booking-repo";
import type { AssignmentExplanation } from "../../core/assignment/round-robin";
import type { BookingState, BookingStateError } from "../../core/booking/state";
import type { Result } from "../../lib/result";
import { isIanaZone } from "../../lib/timezone";
import { emitBookingWebhook as jobsEmitBookingWebhook } from "../../jobs/index";

/** The dashboard settings surface: event types, schedules, teams, and the
 * user directory behind the people picker. Same injected-deps convention as
 * the other route modules. */
export interface AdminDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly listUsers: (workspaceId?: string) => Promise<DirectoryUser[]>;
  readonly listSchedulesForUser: (userId: string) => Promise<ScheduleRecord[]>;
  readonly createSchedule: (input: {
    userId: string;
    name: string;
    timezone: string;
    rules: ScheduleRule[];
    overrides: ScheduleOverride[];
  }) => Promise<ScheduleRecord>;
  readonly updateSchedule: (
    id: string,
    userId: string,
    patch: Partial<{
      name: string;
      timezone: string;
      rules: ScheduleRule[];
      overrides: ScheduleOverride[];
    }>,
  ) => Promise<ScheduleRecord | null>;
  readonly deleteSchedule: (id: string, userId: string) => Promise<"deleted" | "not_found" | "in_use">;
  readonly listTeamsForUser: (userId: string, workspaceId?: string) => Promise<TeamRecord[]>;
  readonly createTeam: (input: {
    name: string;
    slug: string;
    creatorUserId: string;
    workspaceId?: string;
  }) => Promise<TeamRecord | "slug_taken">;
  readonly isTeamMember: (teamId: string, userId: string) => Promise<boolean>;
  readonly isTeamAdmin: (teamId: string, userId: string) => Promise<boolean>;
  readonly isAppAdmin: (userId: string, workspaceId?: string) => Promise<boolean>;
  readonly listTeamMembers: (teamId: string) => Promise<TeamMemberRecord[]>;
  readonly addTeamMember: (teamId: string, userId: string) => Promise<void>;
  readonly removeTeamMember: (
    teamId: string,
    userId: string,
  ) => Promise<"removed" | "not_found" | "last_admin">;
  readonly updateTeamMemberAdmin: (
    teamId: string,
    userId: string,
    isAdmin: boolean,
  ) => Promise<"updated" | "not_found" | "last_admin">;
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
  readonly getAssignmentExplanationForUser?: (
    bookingId: string,
    userId: string,
  ) => Promise<AssignmentExplanation | null>;
  readonly listBookingsForUser?: (input: {
    userId: string;
    filter: "upcoming" | "past";
    status?: string;
    page: number;
    pageSize: number;
    now: Temporal.Instant;
  }) => Promise<AdminBookingPage>;
  readonly getBookingDetailForUser?: (
    bookingId: string,
    userId: string,
  ) => Promise<AdminBookingDetail | null>;
  readonly markBookingNoShowForUser?: (
    bookingId: string,
    userId: string,
  ) => Promise<Result<BookingState, BookingStateError> | null>;
  readonly emitBookingWebhook?: (bookingId: string, kind: "no_show") => Promise<void>;
  readonly now?: () => Temporal.Instant;
}

const defaultDeps: AdminDeps = {
  requireAuth: requireSession,
  listUsers: (workspaceId) => listUsers(undefined, workspaceId),
  listSchedulesForUser: (userId) => listSchedulesForUser(userId),
  createSchedule: (input) => createSchedule(input),
  updateSchedule: (id, userId, patch) => updateSchedule(id, userId, patch),
  deleteSchedule: (id, userId) => deleteSchedule(id, userId),
  listTeamsForUser: (userId, workspaceId) =>
    listTeamsForUser(userId, undefined, workspaceId),
  createTeam: (input) => createTeam(input),
  isTeamMember: (teamId, userId) => isTeamMember(teamId, userId),
  isTeamAdmin: (teamId, userId) => isTeamAdmin(teamId, userId),
  isAppAdmin: (userId, workspaceId) => isAppAdmin(userId, undefined, workspaceId),
  listTeamMembers: (teamId) => listTeamMembers(teamId),
  addTeamMember: (teamId, userId) => addTeamMember(teamId, userId),
  removeTeamMember: (teamId, userId) => removeTeamMember(teamId, userId),
  updateTeamMemberAdmin: (teamId, userId, isAdmin) =>
    updateTeamMemberAdmin(teamId, userId, isAdmin),
  listEventTypesForUser: (userId) => listEventTypesForUser(userId),
  getEventTypeForAdmin: (id, userId) => getEventTypeForAdmin(id, userId),
  createEventType: (ownerUserId, input) => createEventType(ownerUserId, input),
  updateEventType: (id, userId, input) => updateEventType(id, userId, input),
  deleteEventType: (id, userId) => deleteEventType(id, userId),
  getAssignmentExplanationForUser: (bookingId, userId) =>
    getAssignmentExplanationForUser(bookingId, userId),
  listBookingsForUser: (input) => listBookingsForUser(input),
  getBookingDetailForUser: (bookingId, userId) =>
    getBookingDetailForUser(bookingId, userId),
  markBookingNoShowForUser: (bookingId, userId) =>
    markBookingNoShowForUser(bookingId, userId),
  emitBookingWebhook: (bookingId, kind) => jobsEmitBookingWebhook(bookingId, kind),
  now: () => Temporal.Now.instant(),
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const bookingListQuerySchema = z.object({
  filter: z.enum(["upcoming", "past"]).default("upcoming"),
  status: z.enum(["confirmed", "cancelled", "no_show"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  timezone: z.string().refine(isIanaZone, "must be an IANA timezone").default("UTC"),
});

function renderAdminInstant(instant: Temporal.Instant, timezone: string) {
  return {
    utc: instant.toString(),
    invitee: instant.toZonedDateTimeISO(timezone).toString(),
  };
}

function renderAdminBooking(row: AdminBookingPage["bookings"][number], timezone: string) {
  return {
    id: row.id,
    eventType: row.eventType,
    start: renderAdminInstant(row.startsAt, timezone),
    end: renderAdminInstant(row.endsAt, timezone),
    inviteeName: row.inviteeName,
    inviteeEmail: row.inviteeEmail,
    hostUserIds: row.hostUserIds,
    status: row.status,
    inviteStatus: row.inviteStatus,
  };
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
  overrides: z.array(z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    kind: z.enum(["available", "unavailable"]),
    start: z.string().regex(HHMM_RE).optional(),
    end: z.string().regex(HHMM_RE).optional(),
    forwardToUserId: z.string().uuid().nullable().optional(),
  }).superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "end date must not precede start date" });
    }
    if (value.kind === "available" && (!value.start || !value.end)) {
      context.addIssue({ code: "custom", message: "available overrides require start and end times" });
    }
    if ((value.start === undefined) !== (value.end === undefined)) {
      context.addIssue({ code: "custom", message: "start and end times must be provided together" });
    }
    if (value.start && value.end && value.start >= value.end) {
      context.addIssue({ code: "custom", message: "start must be before end" });
    }
    if (value.forwardToUserId && value.kind !== "unavailable") {
      context.addIssue({ code: "custom", message: "only unavailable time can be forwarded" });
    }
  })).max(100).default([]),
});

const eventTypeBodySchema = z
  .object({
    slug: z.string().min(1).max(80).regex(SLUG_RE, "kebab-case only"),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().default(null),
    durationMinutes: z.number().int().min(5).max(480),
    bufferBeforeMin: z.number().int().min(0).max(240),
    bufferAfterMin: z.number().int().min(0).max(240),
    minimumNoticeMin: z.number().int().min(0).max(10080),
    rollingWindowDays: z.number().int().min(1).max(90),
    mode: z.enum(["solo", "round_robin", "group"]),
    scheduleId: z.string().uuid().nullable(),
    teamId: z.string().uuid().nullable(),
    theme: z.enum(themeNames).default("default"),
    layout: z.enum(bookingLayoutNames).default("focus"),
    logoUrl: z.string().url().max(2048).nullable().default(null),
    meetingFormats: z.array(z.enum(["phone", "google_meet"])).min(1).max(2)
      .default(["google_meet"]),
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
const memberRoleBodySchema = z.object({ isAdmin: z.boolean() });

export function createAdminRoutes(deps: AdminDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  for (const path of [
    "/api/me/users",
    "/api/me/schedules",
    "/api/me/teams",
    "/api/me/event-types",
    "/api/me/theme-options",
    "/api/me/bookings",
  ]) {
    router.use(path, deps.requireAuth);
    router.use(`${path}/*`, deps.requireAuth);
  }

  // ---- directory ----

  router.get("/api/me/users", async (c) => {
    return c.json({ users: await deps.listUsers(c.get("user").workspaceId) });
  });

  // ---- booking assignment transparency ----

  router.get("/api/me/bookings/:id/assignment", async (c) => {
    const assignment = await deps.getAssignmentExplanationForUser?.(
      c.req.param("id"),
      c.get("user").id,
    );
    if (!assignment) return c.json({ error: "no_assignment" }, 404);
    return c.json({ assignment });
  });

  router.get("/api/me/bookings", async (c) => {
    const parsed = bookingListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid_query", issues: parsed.error.issues }, 400);
    }
    const { timezone, ...query } = parsed.data;
    const page = await deps.listBookingsForUser?.({
      userId: c.get("user").id,
      ...query,
      now: deps.now?.() ?? Temporal.Now.instant(),
    });
    const result = page ?? { bookings: [], total: 0 };
    return c.json({
      bookings: result.bookings.map((booking) => renderAdminBooking(booking, timezone)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    });
  });

  router.get("/api/me/bookings/:id", async (c) => {
    const timezone = c.req.query("timezone") ?? "UTC";
    if (!isIanaZone(timezone)) return c.json({ error: "invalid_timezone" }, 400);
    const detail = await deps.getBookingDetailForUser?.(
      c.req.param("id"),
      c.get("user").id,
    );
    if (!detail) return c.json({ error: "booking_not_found" }, 404);
    return c.json({
      ...renderAdminBooking(detail, timezone),
      inviteeTimezone: detail.inviteeTimezone,
      inviteeNotes: detail.inviteeNotes,
      meetingFormat: detail.meetingFormat,
      inviteePhone: detail.inviteePhone,
      routingAnswers: detail.routingAnswers,
      hasGoogleEvent: detail.hasGoogleEvent,
      events: detail.events.map((event) => ({
        kind: event.kind,
        payload: event.payload,
        createdAt: event.createdAt.toString(),
      })),
    });
  });

  router.post("/api/me/bookings/:id/no-show", async (c) => {
    const bookingId = c.req.param("id");
    const result = await deps.markBookingNoShowForUser?.(
      bookingId,
      c.get("user").id,
    );
    if (!result) return c.json({ error: "booking_not_found" }, 404);
    if (!result.ok) return c.json({ error: result.error.reason }, 409);
    await deps.emitBookingWebhook?.(bookingId, "no_show");
    return c.json({ bookingId, status: result.value.status });
  });

  // ---- schedules ----

  router.get("/api/me/schedules", async (c) => {
    return c.json({ schedules: await deps.listSchedulesForUser(c.get("user").id) });
  });

  router.post("/api/me/schedules", async (c) => {
    const parsed = scheduleBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const userId = c.get("user").id;
    if (parsed.data.overrides.some((override) => override.forwardToUserId === userId)) {
      return c.json({ error: "cannot_forward_to_self" }, 409);
    }
    const row = await deps.createSchedule({ userId, ...parsed.data });
    return c.json(row, 201);
  });

  router.put("/api/me/schedules/:id", async (c) => {
    const parsed = scheduleBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const userId = c.get("user").id;
    if (parsed.data.overrides.some((override) => override.forwardToUserId === userId)) {
      return c.json({ error: "cannot_forward_to_self" }, 409);
    }
    const row = await deps.updateSchedule(c.req.param("id"), userId, parsed.data);
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
    const user = c.get("user");
    return c.json({ teams: await deps.listTeamsForUser(user.id, user.workspaceId) });
  });

  router.post("/api/me/teams", async (c) => {
    const parsed = teamBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    const result = await deps.createTeam({
      ...parsed.data,
      creatorUserId: user.id,
      workspaceId: user.workspaceId,
    });
    if (result === "slug_taken") return c.json({ error: "slug_taken" }, 409);
    return c.json(result, 201);
  });

  router.get("/api/me/teams/:id/members", async (c) => {
    const teamId = c.req.param("id");
    const userId = c.get("user").id;
    if (
      !(await deps.isTeamMember(teamId, userId))
      && !(await deps.isAppAdmin(userId, c.get("user").workspaceId))
    ) {
      return c.json({ error: "team_not_found" }, 404);
    }
    return c.json({ members: await deps.listTeamMembers(teamId) });
  });

  router.post("/api/me/teams/:id/members", async (c) => {
    const teamId = c.req.param("id");
    const userId = c.get("user").id;
    if (
      !(await deps.isTeamAdmin(teamId, userId))
      && !(await deps.isAppAdmin(userId, c.get("user").workspaceId))
    ) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const parsed = memberBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    await deps.addTeamMember(teamId, parsed.data.userId);
    return c.json({ ok: true }, 201);
  });

  router.delete("/api/me/teams/:id/members/:userId", async (c) => {
    const teamId = c.req.param("id");
    const actorId = c.get("user").id;
    if (
      !(await deps.isTeamAdmin(teamId, actorId))
      && !(await deps.isAppAdmin(actorId, c.get("user").workspaceId))
    ) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const removed = await deps.removeTeamMember(teamId, c.req.param("userId"));
    if (removed === "not_found") return c.json({ error: "member_not_found" }, 404);
    if (removed === "last_admin") return c.json({ error: "last_team_admin" }, 409);
    return c.json({ ok: true });
  });

  router.patch("/api/me/teams/:id/members/:userId", async (c) => {
    const teamId = c.req.param("id");
    const actorId = c.get("user").id;
    if (
      !(await deps.isTeamAdmin(teamId, actorId))
      && !(await deps.isAppAdmin(actorId, c.get("user").workspaceId))
    ) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const parsed = memberRoleBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const result = await deps.updateTeamMemberAdmin(
      teamId,
      c.req.param("userId"),
      parsed.data.isAdmin,
    );
    if (result === "not_found") return c.json({ error: "member_not_found" }, 404);
    if (result === "last_admin") return c.json({ error: "last_team_admin" }, 409);
    return c.json({ ok: true });
  });

  // ---- event types ----

  router.get("/api/me/theme-options", (c) => {
    const user = c.get("user");
    const names = themeNames.filter((theme) => canUseTheme(theme, user.email));
    return c.json({
      themes: names.map((value) => ({ value, label: themeLabels[value] })),
      publicThemes: [...publicThemeNames],
      layouts: [
        { value: "focus", label: "Focus" },
        { value: "split", label: "Split" },
        { value: "compact", label: "Compact" },
      ],
    });
  });

  router.get("/api/me/event-types", async (c) => {
    return c.json({ eventTypes: await deps.listEventTypesForUser(c.get("user").id) });
  });

  router.post("/api/me/event-types", async (c) => {
    const parsed = eventTypeBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    if (!canUseTheme(parsed.data.theme, user.email)) {
      return c.json({ error: "theme_not_available" }, 403);
    }
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
    if (!canUseTheme(parsed.data.theme, user.email)) {
      return c.json({ error: "theme_not_available" }, 403);
    }
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

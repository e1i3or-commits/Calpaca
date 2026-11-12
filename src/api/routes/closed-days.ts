import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { isUsHolidayKey, US_HOLIDAYS, type UsHolidayKey } from "@calpaca/core";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  addWorkspaceClosedRange,
  deleteWorkspaceClosedRange,
  getWorkspaceClosedDays,
  setWorkspaceUsHolidays,
  workspaceClosedDaysBetween,
} from "../../db/closed-days-repo";

export interface ClosedDaysDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly get: typeof getWorkspaceClosedDays;
  readonly between: typeof workspaceClosedDaysBetween;
  readonly setHolidays: typeof setWorkspaceUsHolidays;
  readonly addRange: typeof addWorkspaceClosedRange;
  readonly deleteRange: typeof deleteWorkspaceClosedRange;
}

const defaultDeps: ClosedDaysDeps = {
  requireAuth: requireSession,
  get: getWorkspaceClosedDays,
  between: workspaceClosedDaysBetween,
  setHolidays: setWorkspaceUsHolidays,
  addRange: addWorkspaceClosedRange,
  deleteRange: deleteWorkspaceClosedRange,
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "invalid date");
// A year is enough for any calendar view, and keeps one request from expanding decades.
const MAX_SPAN_DAYS = 400;

export const closedDaysHolidaysBodySchema = z.object({
  usHolidays: z.array(z.string().refine(isUsHolidayKey, "unknown holiday")).max(US_HOLIDAYS.length),
});

export const closedRangeBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  startDate: isoDate,
  endDate: isoDate,
});

const rangeSchema = closedRangeBodySchema.refine((range) => range.endDate >= range.startDate, { message: "endDate is before startDate", path: ["endDate"] })
  .refine((range) => (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 < 31, { message: "a closed range is at most 31 days", path: ["endDate"] });

const betweenSchema = z.object({ from: isoDate, to: isoDate })
  .refine((q) => q.to >= q.from && (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= MAX_SPAN_DAYS, "from..to must be ascending and at most 400 days");

function canManage(role: string | undefined) {
  return role === "owner" || role === "admin";
}

/**
 * Workspace closed days: which US holidays it observes and its own closed
 * ranges. Any member can read them (Tyger reads them with a member token);
 * only an owner or admin changes them.
 */
export function createClosedDaysRoutes(deps: ClosedDaysDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/closed-days", deps.requireAuth);
  router.use("/api/me/closed-days/*", deps.requireAuth);

  router.get("/api/me/closed-days", async (c) => {
    const { workspaceId } = c.get("user");
    if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const config = await deps.get(workspaceId);
    const observed = new Set<string>(config.usHolidays);
    return c.json({
      usHolidays: US_HOLIDAYS.map((holiday) => ({ ...holiday, observed: observed.has(holiday.key) })),
      ranges: config.ranges,
      canManage: canManage(c.get("user").workspaceRole),
    });
  });

  router.get("/api/me/closed-days/dates", async (c) => {
    const { workspaceId } = c.get("user");
    if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = betweenSchema.safeParse({ from: c.req.query("from"), to: c.req.query("to") });
    if (!parsed.success) return c.json({ error: "invalid_range", issues: parsed.error.issues }, 400);
    return c.json({ days: await deps.between(workspaceId, parsed.data.from, parsed.data.to) });
  });

  router.put("/api/me/closed-days/holidays", async (c) => {
    const user = c.get("user");
    if (!user.workspaceId || !canManage(user.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    const parsed = closedDaysHolidaysBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    await deps.setHolidays(user.workspaceId, parsed.data.usHolidays as UsHolidayKey[]);
    return c.json({ ok: true });
  });

  router.post("/api/me/closed-days", async (c) => {
    const user = c.get("user");
    if (!user.workspaceId || !canManage(user.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    const parsed = rangeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    return c.json({ range: await deps.addRange(user.workspaceId, parsed.data) }, 201);
  });

  router.delete("/api/me/closed-days/:id", async (c) => {
    const user = c.get("user");
    if (!user.workspaceId || !canManage(user.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "not_found" }, 404);
    return (await deps.deleteRange(user.workspaceId, id.data)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });

  return router;
}

export const closedDaysRoutes = createClosedDaysRoutes();

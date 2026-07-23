import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  getAnalyticsReport,
  type AnalyticsReport,
} from "../../db/analytics-repo";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const querySchema = z.object({
  from: z.string().regex(MONTH_RE),
  to: z.string().regex(MONTH_RE),
});

export interface AnalyticsDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly getReport: (userId: string, from: Date, to: Date) => Promise<AnalyticsReport>;
}

const defaultDeps: AnalyticsDeps = {
  requireAuth: requireSession,
  getReport: (userId, from, to) => getAnalyticsReport(userId, from, to),
};

function range(query: unknown): { from: Date; to: Date } | null {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return null;
  const from = new Date(`${parsed.data.from}-01T00:00:00.000Z`);
  const inclusiveTo = new Date(`${parsed.data.to}-01T00:00:00.000Z`);
  const to = new Date(Date.UTC(inclusiveTo.getUTCFullYear(), inclusiveTo.getUTCMonth() + 1, 1));
  return from < to ? { from, to } : null;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportCsv(report: AnalyticsReport): string {
  const rows: (string | number)[][] = [
    ["report", "event_type", "period_or_host", "metric", "value"],
  ];
  for (const row of report.outcomes) {
    rows.push(["outcomes", row.eventTypeSlug, row.month, row.status, row.count]);
  }
  for (const row of report.leadTime) {
    rows.push(["lead_time", row.eventTypeSlug, "selected_range", "booking_count", row.bookingCount]);
    rows.push(["lead_time", row.eventTypeSlug, "selected_range", "average_hours", row.averageHours]);
    rows.push(["lead_time", row.eventTypeSlug, "selected_range", "median_hours", row.medianHours]);
  }
  for (const row of report.noShowRates) {
    rows.push(["no_show_rate", row.eventTypeSlug, "lifetime", "completed_count", row.completedCount]);
    rows.push(["no_show_rate", row.eventTypeSlug, "lifetime", "no_show_count", row.noShowCount]);
    rows.push(["no_show_rate", row.eventTypeSlug, "lifetime", "no_show_rate", row.noShowRate]);
  }
  for (const row of report.roundRobin) {
    rows.push(["round_robin", row.eventTypeSlug, row.hostEmail, "booking_count", row.bookingCount]);
    rows.push(["round_robin", row.eventTypeSlug, row.hostEmail, "booking_share", row.bookingShare]);
    rows.push(["round_robin", row.eventTypeSlug, row.hostEmail, "weight_share", row.weightShare]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function createAnalyticsRoutes(deps: AnalyticsDeps = defaultDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.use("/api/me/analytics", deps.requireAuth);
  routes.use("/api/me/analytics.csv", deps.requireAuth);

  routes.get("/api/me/analytics", async (c) => {
    const selected = range(c.req.query());
    if (!selected) return c.json({ error: "invalid_query" }, 400);
    return c.json(await deps.getReport(c.get("user").id, selected.from, selected.to));
  });

  routes.get("/api/me/analytics.csv", async (c) => {
    const selected = range(c.req.query());
    if (!selected) return c.json({ error: "invalid_query" }, 400);
    const csv = reportCsv(await deps.getReport(c.get("user").id, selected.from, selected.to));
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", "attachment; filename=\"calpaca-analytics.csv\"");
    return c.body(csv);
  });

  return routes;
}

export const analyticsRoutes = createAnalyticsRoutes();

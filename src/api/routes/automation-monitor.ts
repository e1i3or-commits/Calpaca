import { Hono } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { workspaces } from "../../db/schema";
import { kickoffDeliveryReport } from "../../db/kickoff-delivery-repo";

interface MonitorDeps {
  binding: () => { token: string; workspaceId: string };
  workspaceExists: (workspaceId: string) => Promise<boolean>;
  report: typeof kickoffDeliveryReport;
}
const defaults: MonitorDeps = {
  binding: () => ({ token: process.env.ONBOARDING_MONITOR_TOKEN ?? "", workspaceId: process.env.ONBOARDING_MONITOR_WORKSPACE_ID ?? "" }),
  workspaceExists: async id => (await getDb().select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, id)).limit(1)).length === 1,
  report: kickoffDeliveryReport,
};

/** Does not establish a user session and cannot authorize provisioning. */
export function createAutomationMonitorRoutes(deps: MonitorDeps = defaults) {
  const router = new Hono();
  router.get("/api/automation/monitor", async c => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    const binding = deps.binding();
    if (binding.token.length < 32 || !z.string().uuid().safeParse(binding.workspaceId).success)
      return c.json({ error: "monitor_not_configured" }, 503);
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(c.req.header("authorization") ?? ""), hash(`Bearer ${binding.token}`)))
      return c.json({ error: "unauthorized" }, 401);
    try {
      if (!await deps.workspaceExists(binding.workspaceId)) return c.json({ error: "monitor_workspace_unavailable" }, 503);
      const report = await deps.report(binding.workspaceId);
      if (report.workspaceId !== binding.workspaceId) return c.json({ error: "monitor_workspace_mismatch" }, 503);
      // Explicit allowlist prevents future report details leaking to the monitor.
      return c.json({ workspaceId: report.workspaceId, checkedAt: report.checkedAt,
        attention: report.attention, overdue: report.overdue, reservationAttention: report.reservationAttention,
        reservationPending: report.reservationPending, reservationOverdue: report.reservationOverdue,
        extensionAttention: report.extensionAttention, extensionOverdue: report.extensionOverdue,
        workerStale: report.workerStale, schedulerStale: report.schedulerStale, feedbackStale: report.feedbackStale,
        lastSweepAt: report.lastSweepAt, schedulerLastSweepAt: report.schedulerLastSweepAt, feedbackLastPollAt: report.feedbackLastPollAt });
    } catch {
      return c.json({ error: "monitor_health_unavailable" }, 503);
    }
  });
  return router;
}
export const automationMonitorRoutes = createAutomationMonitorRoutes();

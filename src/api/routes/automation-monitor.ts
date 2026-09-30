import { Hono, type Handler } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { workspaces } from "../../db/schema";
import { kickoffDeliveryReport } from "../../db/kickoff-delivery-repo";

import { meetingNotesHealth } from "../../db/meeting-notes-queue";

interface MonitorDeps {
  notesReport?: typeof meetingNotesHealth;
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
  const handler: Handler = async c => {
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
      if(c.req.path === "/api/automation/monitor/meeting-notes") {
        const report=await (deps.notesReport??meetingNotesHealth)(binding.workspaceId);
        return c.json({workspaceId:binding.workspaceId,checkedAt:new Date().toISOString(),
          worker:report.worker?{since:report.worker.since,last_polled_at:report.worker.last_polled_at}:null,
          pending:report.pending,failed:report.failed,expired:report.expired,oldest_due:report.oldest_due});
      }
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
  };
  router.get("/api/automation/monitor",handler);
  router.get("/api/automation/monitor/meeting-notes",handler);
  return router;
}
export const automationMonitorRoutes = createAutomationMonitorRoutes();

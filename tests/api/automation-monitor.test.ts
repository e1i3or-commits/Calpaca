import { expect, test } from "bun:test";
import { createAutomationMonitorRoutes } from "../../src/api/routes/automation-monitor";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const token = "synthetic-monitor-health-only-token-32";
const report = { workspaceId, checkedAt: new Date().toISOString(), feedbackStale: true, feedbackLastPollAt: null,
  workerStale: true, lastSweepAt: null, schedulerStale: true, schedulerLastSweepAt: null,
  attention: 0, overdue: 0, reservationAttention: 0, reservationPending: 0, reservationOverdue: 0,
  extensionAttention: 0, extensionOverdue: 0, deliveries: [] };
test("monitor credential is workspace-bound, read-only and exposes only aggregate status", async () => {
  let received = "";
  const app = createAutomationMonitorRoutes({ binding: () => ({ token, workspaceId }),
    workspaceExists: async id => id === workspaceId,
    report: async id => { received = id; return { ...report, privateDetail: "must not leak" }; } });
  expect((await app.request("/api/automation/monitor")).status).toBe(401);
  const headers = { authorization: `Bearer ${token}` };
  const response = await app.request("/api/automation/monitor?workspaceId=other", { headers });
  expect(response.status).toBe(200); expect(received).toBe(workspaceId);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json(); expect(body).toMatchObject({ workspaceId });
  expect(body).not.toHaveProperty("deliveries"); expect(body).not.toHaveProperty("privateDetail");
  expect((await app.request("/api/automation/monitor", { method: "POST", headers })).status).toBe(404);
});
test("monitor fails closed when configuration or its workspace is unavailable", async () => {
  for (const binding of [{ token: "", workspaceId }, { token, workspaceId: "invalid" }]) {
    const app = createAutomationMonitorRoutes({ binding: () => binding, workspaceExists: async () => true, report: async () => report });
    expect((await app.request("/api/automation/monitor")).status).toBe(503);
  }
  const app = createAutomationMonitorRoutes({ binding: () => ({ token, workspaceId }), workspaceExists: async () => false, report: async () => report });
  expect((await app.request("/api/automation/monitor", { headers: { authorization: `Bearer ${token}` } })).status).toBe(503);
});

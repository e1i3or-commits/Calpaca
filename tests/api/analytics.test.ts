import { describe, expect, test } from "bun:test";
import {
  createAnalyticsRoutes,
  type AnalyticsDeps,
} from "../../src/api/routes/analytics";
import type { AnalyticsReport } from "../../src/db/analytics-repo";

const report: AnalyticsReport = {
  outcomes: [{
    eventTypeSlug: "intro",
    month: "2026-07",
    status: "confirmed",
    count: 4,
  }],
  leadTime: [{
    eventTypeSlug: "intro",
    bookingCount: 4,
    averageHours: 36,
    medianHours: 24,
  }],
  noShowRates: [{
    eventTypeSlug: "intro",
    completedCount: 5,
    noShowCount: 1,
    noShowRate: 0.2,
  }],
  roundRobin: [{
    eventTypeSlug: "sales",
    hostName: "Ada",
    hostEmail: "ada@example.com",
    weight: 100,
    bookingCount: 3,
    bookingShare: 0.6,
    weightShare: 0.5,
  }],
};

function deps(): AnalyticsDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: "user-1", email: "host@example.com", name: "Host" });
      await next();
    },
    getReport: async () => report,
  };
}

describe("organizer analytics routes", () => {
  test("returns the four view-backed report sections for a valid month range", async () => {
    let captured: { userId: string; from: string; to: string } | undefined;
    const custom = deps();
    const response = await createAnalyticsRoutes({
      ...custom,
      getReport: async (userId, from, to) => {
        captured = { userId, from: from.toISOString(), to: to.toISOString() };
        return report;
      },
    }).request("/api/me/analytics?from=2026-01&to=2026-07");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(captured).toEqual({
      userId: "user-1",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    });
  });

  test("rejects malformed or inverted ranges", async () => {
    const routes = createAnalyticsRoutes(deps());
    expect((await routes.request("/api/me/analytics?from=July&to=2026-07")).status).toBe(400);
    expect((await routes.request("/api/me/analytics?from=2026-08&to=2026-07")).status).toBe(400);
  });

  test("exports the same report as a tidy CSV attachment", async () => {
    const response = await createAnalyticsRoutes(deps())
      .request("/api/me/analytics.csv?from=2026-01&to=2026-07");
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("calpaca-analytics.csv");
    expect(csv).toContain("outcomes,intro,2026-07,confirmed,4");
    expect(csv).toContain("lead_time,intro,selected_range,median_hours,24");
    expect(csv).toContain("no_show_rate,intro,lifetime,no_show_rate,0.2");
    expect(csv).toContain("round_robin,sales,ada@example.com,booking_share,0.6");
  });
});

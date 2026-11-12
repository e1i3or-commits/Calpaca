import { describe, expect, test } from "bun:test";
import { closedDaysBetween, DEFAULT_US_HOLIDAYS } from "@calpaca/core";
import { createClosedDaysRoutes, type ClosedDaysDeps } from "../../src/api/routes/closed-days";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const RANGE_ID = "33333333-3333-4333-8333-333333333333";
const conference = { id: RANGE_ID, name: "TourScale Conference", startDate: "2027-02-01", endDate: "2027-02-04" };

function deps(role: "member" | "owner" | "admin", overrides: Partial<ClosedDaysDeps> = {}): ClosedDaysDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: USER_ID, email: "a@example.test", name: "A", workspaceId: WORKSPACE_ID, workspaceRole: role });
      await next();
    },
    get: async () => ({ usHolidays: [...DEFAULT_US_HOLIDAYS], ranges: [conference] }),
    between: async (_workspaceId, from, to) => closedDaysBetween(from, to, DEFAULT_US_HOLIDAYS, [conference]),
    setHolidays: async () => undefined,
    addRange: async (_workspaceId, range) => ({ id: RANGE_ID, ...range }),
    deleteRange: async () => true,
    ...overrides,
  };
}

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("closed days API", () => {
  test("any member reads the holidays it observes and its ranges", async () => {
    const res = await createClosedDaysRoutes(deps("member")).request("/api/me/closed-days");
    expect(res.status).toBe(200);
    const body = await res.json() as { usHolidays: { key: string; observed: boolean }[]; ranges: unknown[]; canManage: boolean };
    expect(body.usHolidays.filter((h) => h.observed).map((h) => h.key)).toEqual([...DEFAULT_US_HOLIDAYS]);
    expect(body.usHolidays.find((h) => h.key === "mlk_day")?.observed).toBe(false);
    expect(body.ranges).toEqual([conference]);
    expect(body.canManage).toBe(false);
  });

  test("dates expands holidays and ranges into days", async () => {
    const res = await createClosedDaysRoutes(deps("member")).request("/api/me/closed-days/dates?from=2027-01-30&to=2027-02-05");
    expect(res.status).toBe(200);
    expect((await res.json() as { days: { date: string }[] }).days.map((d) => d.date)).toEqual([
      "2027-02-01", "2027-02-02", "2027-02-03", "2027-02-04",
    ]);
  });

  test("dates refuses a span over 400 days", async () => {
    const res = await createClosedDaysRoutes(deps("member")).request("/api/me/closed-days/dates?from=2026-01-01&to=2028-01-01");
    expect(res.status).toBe(400);
  });

  test("a member cannot change them", async () => {
    const routes = createClosedDaysRoutes(deps("member"));
    expect((await routes.request("/api/me/closed-days", json({ name: "Offsite", startDate: "2027-03-01", endDate: "2027-03-02" }))).status).toBe(403);
    expect((await routes.request("/api/me/closed-days/holidays", { ...json({ usHolidays: [] }), method: "PUT" })).status).toBe(403);
    expect((await routes.request(`/api/me/closed-days/${RANGE_ID}`, { method: "DELETE" })).status).toBe(403);
  });

  test("an admin adds a range and sets the holidays", async () => {
    let saved: string[] = [];
    const routes = createClosedDaysRoutes(deps("admin", { setHolidays: async (_w, keys) => { saved = [...keys]; } }));
    const added = await routes.request("/api/me/closed-days", json({ name: "Offsite", startDate: "2027-03-01", endDate: "2027-03-02" }));
    expect(added.status).toBe(201);
    const put = await routes.request("/api/me/closed-days/holidays", { ...json({ usHolidays: ["thanksgiving", "christmas_day"] }), method: "PUT" });
    expect(put.status).toBe(200);
    expect(saved).toEqual(["thanksgiving", "christmas_day"]);
  });

  test("rejects an unknown holiday and a backwards range", async () => {
    const routes = createClosedDaysRoutes(deps("owner"));
    expect((await routes.request("/api/me/closed-days/holidays", { ...json({ usHolidays: ["boxing_day"] }), method: "PUT" })).status).toBe(400);
    expect((await routes.request("/api/me/closed-days", json({ name: "Oops", startDate: "2027-03-05", endDate: "2027-03-01" }))).status).toBe(400);
  });

  test("deleting a range that is not in the workspace is a 404", async () => {
    const routes = createClosedDaysRoutes(deps("admin", { deleteRange: async () => false }));
    expect((await routes.request(`/api/me/closed-days/${RANGE_ID}`, { method: "DELETE" })).status).toBe(404);
  });
});

import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { createEngagementSeriesRoutes, type EngagementSeriesDeps } from "../../src/api/routes/engagement-series";
import type { AuthEnv } from "../../src/auth/session";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const ENGAGEMENT_ID = "00000000-0000-4000-8000-000000000003";
const PERSON_ID = "00000000-0000-4000-8000-000000000004";

const signedIn: MiddlewareHandler<AuthEnv> = async (c, next) => {
  c.set("user", { id: USER_ID, email: "kai@example.com", name: "Kai", workspaceId: WORKSPACE_ID, workspaceRole: "admin" });
  await next();
};
const signedOut: MiddlewareHandler<AuthEnv> = async (c) => c.json({ error: "unauthorized" }, 401);

function deps(overrides: Partial<EngagementSeriesDeps> = {}): EngagementSeriesDeps {
  return {
    requireAuth: signedIn,
    list: (async () => []) as EngagementSeriesDeps["list"],
    get: (async () => null) as EngagementSeriesDeps["get"],
    setPerson: (async () => ({ kind: "not_found" })) as EngagementSeriesDeps["setPerson"],
    removePerson: (async () => ({ kind: "not_found" })) as EngagementSeriesDeps["removePerson"],
    ...overrides,
  };
}

const json = (body: unknown) => ({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("engagement series routes", () => {
  test("require a session or token and are never cached", async () => {
    const app = createEngagementSeriesRoutes(deps({ requireAuth: signedOut }));
    for (const path of ["/api/me/engagement-series", `/api/me/engagement-series/${ENGAGEMENT_ID}`]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect((await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/${PERSON_ID}`, json({ role: "observer" }))).status).toBe(401);
  });

  test("lists through the actor's workspace and validates the status filter", async () => {
    let received: unknown[] = [];
    const app = createEngagementSeriesRoutes(deps({
      list: (async (...args: unknown[]) => { received = args; return []; }) as EngagementSeriesDeps["list"],
    }));
    const res = await app.request("/api/me/engagement-series?status=paused");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ engagements: [] });
    expect(received.slice(0, 3)).toEqual([WORKSPACE_ID, { userId: USER_ID, workspaceRole: "admin" }, { status: "paused" }]);
    expect((await app.request("/api/me/engagement-series?status=gone")).status).toBe(400);
    expect((await app.request("/api/me/engagement-series?other=1")).status).toBe(400);
    const from = "2026-10-01T00:00:00Z", to = "2026-11-01T00:00:00Z";
    expect((await app.request(`/api/me/engagement-series?meetingsFrom=${from}&meetingsTo=${to}`)).status).toBe(200);
    expect(received[2]).toEqual({ meetings: { from: new Date(from), to: new Date(to) } });
    expect((await app.request(`/api/me/engagement-series?meetingsFrom=${from}`)).status).toBe(400);
    expect((await app.request(`/api/me/engagement-series?meetingsFrom=${from}&meetingsTo=2027-03-01T00:00:00Z`)).status).toBe(400);
  });

  test("detail answers 404 for a malformed or invisible id", async () => {
    const app = createEngagementSeriesRoutes(deps());
    expect(await (await app.request("/api/me/engagement-series/not-a-uuid")).json()).toEqual({ error: "engagement_not_found" });
    expect((await app.request(`/api/me/engagement-series/${ENGAGEMENT_ID}`)).status).toBe(404);
  });

  test("team changes map each refusal to a status a client can act on", async () => {
    const cases: [string, number][] = [["not_found", 404], ["forbidden", 403], ["invalid_engagement_person", 400], ["account_lead", 409]];
    for (const [kind, status] of cases) {
      const app = createEngagementSeriesRoutes(deps({ setPerson: (async () => ({ kind })) as EngagementSeriesDeps["setPerson"] }));
      const res = await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/${PERSON_ID}`, json({ role: "observer" }));
      expect(res.status).toBe(status);
    }
    let person: unknown;
    const app = createEngagementSeriesRoutes(deps({
      setPerson: (async (_w: string, _a: unknown, _id: string, p: unknown) => { person = p; return { kind: "updated", people: [] }; }) as EngagementSeriesDeps["setPerson"],
      removePerson: (async () => ({ kind: "meeting_attendee" })) as EngagementSeriesDeps["removePerson"],
    }));
    expect((await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/${PERSON_ID}`, json({ role: "  observer " }))).status).toBe(200);
    expect(person).toEqual({ userId: PERSON_ID, role: "observer" });
    expect((await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/${PERSON_ID}`, json({ role: "" }))).status).toBe(400);
    expect((await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/${PERSON_ID}`, json({ role: "x", userId: PERSON_ID }))).status).toBe(400);
    expect((await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/nope`, json({ role: "x" }))).status).toBe(400);
    const removed = await app.request(`/api/me/engagements/${ENGAGEMENT_ID}/people/${PERSON_ID}`, { method: "DELETE" });
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "meeting_attendee" });
  });
});

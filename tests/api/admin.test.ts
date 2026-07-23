import { describe, expect, test } from "bun:test";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import type { AdminEventType, ScheduleRecord, TeamRecord } from "../../src/db/admin-repo";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TEAM = "44444444-4444-4444-8444-444444444444";
const SCHED_ID = "55555555-5555-4555-8555-555555555555";
const ET_ID = "66666666-6666-4666-8666-666666666666";

const schedule: ScheduleRecord = {
  id: SCHED_ID,
  userId: U1,
  name: "Weekdays",
  timezone: "America/New_York",
  rules: [{ dow: 1, start: "09:00", end: "17:00" }],
};

const team: TeamRecord = { id: TEAM_ID, name: "Sales", slug: "sales" };

const eventType: AdminEventType = {
  id: ET_ID,
  ownerUserId: U1,
  teamId: null,
  slug: "intro-call",
  title: "Intro call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: SCHED_ID,
  hosts: [{ userId: U1, role: "member", weight: 100, name: "Host", email: "host@example.test" }],
};

const validEventTypeBody = {
  slug: "intro-call",
  title: "Intro call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: SCHED_ID,
  teamId: null,
  hosts: [{ userId: U1, role: "member", weight: 100 }],
};

function makeDeps(overrides: Partial<AdminDeps> = {}): AdminDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: U1, email: "host@example.test", name: "Host" });
      await next();
    },
    listUsers: async () => [
      { id: U1, name: "Host", email: "host@example.test", timezone: "America/New_York" },
      { id: U2, name: "Other", email: "other@example.test", timezone: "UTC" },
    ],
    listSchedulesForUser: async () => [schedule],
    createSchedule: async (input) => ({ ...schedule, ...input, id: SCHED_ID }),
    updateSchedule: async (id) => (id === SCHED_ID ? schedule : null),
    deleteSchedule: async (id) => (id === SCHED_ID ? "deleted" : "not_found"),
    listTeamsForUser: async () => [team],
    createTeam: async (input) => (input.slug === "sales" ? "slug_taken" : { ...team, ...input }),
    isTeamMember: async (teamId) => teamId === TEAM_ID,
    isTeamAdmin: async (teamId) => teamId === TEAM_ID,
    isAppAdmin: async () => false,
    listTeamMembers: async () => [
      { userId: U1, name: "Host", email: "host@example.test", isAdmin: true },
    ],
    addTeamMember: async () => undefined,
    removeTeamMember: async (_teamId, userId) => userId === U1 ? "removed" : "not_found",
    updateTeamMemberAdmin: async (_teamId, userId) => userId === U1 ? "updated" : "not_found",
    listEventTypesForUser: async () => [eventType],
    getEventTypeForAdmin: async (id) => (id === ET_ID ? eventType : null),
    createEventType: async (_owner, input) =>
      input.slug === "intro-call" ? "slug_taken" : { ...eventType, ...input, hosts: eventType.hosts },
    updateEventType: async (id) => (id === ET_ID ? eventType : null),
    deleteEventType: async (id) => (id === ET_ID ? "deleted" : "not_found"),
    ...overrides,
  };
}

function post(router: ReturnType<typeof createAdminRoutes>, path: string, body: unknown, method = "POST") {
  return router.request(path, { method, body: JSON.stringify(body) });
}

describe("admin routes", () => {
  test("every surface requires a session", async () => {
    const router = createAdminRoutes(
      makeDeps({ requireAuth: async (c) => c.json({ error: "unauthorized" }, 401) }),
    );
    for (const path of [
      "/api/me/users",
      "/api/me/schedules",
      "/api/me/teams",
      "/api/me/event-types",
      `/api/me/schedules/${SCHED_ID}`,
      `/api/me/teams/${TEAM_ID}/members`,
    ]) {
      expect((await router.request(path)).status).toBe(401);
    }
  });

  test("directory lists users for the people picker", async () => {
    const router = createAdminRoutes(makeDeps());
    const res = await router.request("/api/me/users");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string }[] };
    expect(body.users).toHaveLength(2);
  });

  test("schedule create validates timezone and rule ordering", async () => {
    const router = createAdminRoutes(makeDeps());

    const ok = await post(router, "/api/me/schedules", {
      name: "Weekdays",
      timezone: "America/New_York",
      rules: [{ dow: 1, start: "09:00", end: "17:00" }],
    });
    expect(ok.status).toBe(201);

    const badTz = await post(router, "/api/me/schedules", {
      name: "Weekdays",
      timezone: "Mars/Olympus_Mons",
      rules: [],
    });
    expect(badTz.status).toBe(400);

    const inverted = await post(router, "/api/me/schedules", {
      name: "Weekdays",
      timezone: "UTC",
      rules: [{ dow: 1, start: "17:00", end: "09:00" }],
    });
    expect(inverted.status).toBe(400);
  });

  test("schedule update 404s for unknown ids; delete maps in_use to 409", async () => {
    const router = createAdminRoutes(
      makeDeps({ deleteSchedule: async () => "in_use" }),
    );
    const missing = await post(
      router,
      `/api/me/schedules/${OTHER_TEAM}`,
      { name: "X", timezone: "UTC", rules: [] },
      "PUT",
    );
    expect(missing.status).toBe(404);

    const inUse = await router.request(`/api/me/schedules/${SCHED_ID}`, { method: "DELETE" });
    expect(inUse.status).toBe(409);
    expect(((await inUse.json()) as { error: string }).error).toBe("schedule_in_use");
  });

  test("team create surfaces slug_taken and rejects bad slugs", async () => {
    const router = createAdminRoutes(makeDeps());

    const created = await post(router, "/api/me/teams", { name: "Support", slug: "support" });
    expect(created.status).toBe(201);

    const taken = await post(router, "/api/me/teams", { name: "Sales", slug: "sales" });
    expect(taken.status).toBe(409);

    const badSlug = await post(router, "/api/me/teams", { name: "Sales", slug: "Bad Slug!" });
    expect(badSlug.status).toBe(400);
  });

  test("team membership gates member routes as 404, not 403", async () => {
    const router = createAdminRoutes(makeDeps());

    expect((await router.request(`/api/me/teams/${TEAM_ID}/members`)).status).toBe(200);
    expect((await router.request(`/api/me/teams/${OTHER_TEAM}/members`)).status).toBe(404);

    const added = await post(router, `/api/me/teams/${TEAM_ID}/members`, { userId: U2 });
    expect(added.status).toBe(201);

    const removedMissing = await router.request(`/api/me/teams/${TEAM_ID}/members/${U2}`, {
      method: "DELETE",
    });
    expect(removedMissing.status).toBe(404);
    const removed = await router.request(`/api/me/teams/${TEAM_ID}/members/${U1}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
  });

  test("team admin can change roles; the final admin conflict is explicit", async () => {
    const updated = await post(
      createAdminRoutes(makeDeps()),
      `/api/me/teams/${TEAM_ID}/members/${U1}`,
      { isAdmin: false },
      "PATCH",
    );
    expect(updated.status).toBe(200);

    const guarded = await createAdminRoutes(makeDeps({
      removeTeamMember: async () => "last_admin",
      updateTeamMemberAdmin: async () => "last_admin",
    })).request(`/api/me/teams/${TEAM_ID}/members/${U1}`, { method: "DELETE" });
    expect(guarded.status).toBe(409);
    expect(await guarded.json()).toEqual({ error: "last_team_admin" });
  });

  test("application admins can inspect and manage teams without membership", async () => {
    const routes = createAdminRoutes(makeDeps({
      isTeamMember: async () => false,
      isTeamAdmin: async () => false,
      isAppAdmin: async () => true,
    }));
    expect((await routes.request(`/api/me/teams/${OTHER_TEAM}/members`)).status).toBe(200);
    expect((await post(
      routes,
      `/api/me/teams/${OTHER_TEAM}/members`,
      { userId: U2 },
    )).status).toBe(201);
  });

  test("event type create enforces solo=1 host, slug shape, and team membership", async () => {
    const router = createAdminRoutes(makeDeps());

    const twoHostSolo = await post(router, "/api/me/event-types", {
      ...validEventTypeBody,
      hosts: [
        { userId: U1, role: "member", weight: 100 },
        { userId: U2, role: "member", weight: 100 },
      ],
    });
    expect(twoHostSolo.status).toBe(400);

    const badSlug = await post(router, "/api/me/event-types", {
      ...validEventTypeBody,
      slug: "Not A Slug",
    });
    expect(badSlug.status).toBe(400);

    const foreignTeam = await post(router, "/api/me/event-types", {
      ...validEventTypeBody,
      slug: "team-call",
      mode: "round_robin",
      teamId: OTHER_TEAM,
    });
    expect(foreignTeam.status).toBe(404);

    const taken = await post(router, "/api/me/event-types", validEventTypeBody);
    expect(taken.status).toBe(409);

    const created = await post(router, "/api/me/event-types", {
      ...validEventTypeBody,
      slug: "new-call",
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { hosts: unknown[] };
    expect(body.hosts).toHaveLength(1);
  });

  test("event type update 404s outside scope; delete maps in_use to 409", async () => {
    const router = createAdminRoutes(
      makeDeps({ deleteEventType: async () => "in_use" }),
    );

    const missing = await post(
      router,
      `/api/me/event-types/${OTHER_TEAM}`,
      validEventTypeBody,
      "PUT",
    );
    expect(missing.status).toBe(404);

    const inUse = await router.request(`/api/me/event-types/${ET_ID}`, { method: "DELETE" });
    expect(inUse.status).toBe(409);
    expect(((await inUse.json()) as { error: string }).error).toBe("event_type_in_use");
  });
});

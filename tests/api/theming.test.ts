import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createAvailabilityRoutes, type AvailabilityDeps } from "../../src/api/routes/availability";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import type { EventTypeConfig } from "../../src/db/availability-repo";
import type { AdminEventType } from "../../src/db/admin-repo";

const U1 = "11111111-1111-4111-8111-111111111111";
const ET_ID = "66666666-6666-4666-8666-666666666666";

const eventType: EventTypeConfig = {
  id: ET_ID,
  slug: "intro-call",
  title: "Intro call",
  theme: "midnight",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 14,
  maxPerDay: null,
  curatedSlotCount: 3,
  publicSelectableHostIds: [],
};

function availabilityDeps(overrides: Partial<AvailabilityDeps> = {}): AvailabilityDeps {
  return {
    getEventTypeBySlug: async (slug) => (slug === "intro-call" ? eventType : null),
    getEventTypeHosts: async () => [],
    getSchedulesForUsers: async () => [],
    getBusyForUsers: async () => [],
    now: () => Temporal.Instant.from("2027-05-01T00:00Z"),
    ...overrides,
  };
}

describe("public event-type meta", () => {
  test("returns title, duration, and theme for a known slug", async () => {
    const router = createAvailabilityRoutes(availabilityDeps());
    const res = await router.request("/event-types/intro-call");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      slug: "intro-call",
      title: "Intro call",
      durationMinutes: 30,
      theme: "midnight",
    });
  });

  test("404s on an unknown slug", async () => {
    const router = createAvailabilityRoutes(availabilityDeps());
    const res = await router.request("/event-types/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "event_type_not_found" });
  });

  test("an unregistered stored theme resolves to the default", async () => {
    const router = createAvailabilityRoutes(
      availabilityDeps({
        getEventTypeBySlug: async () => ({ ...eventType, theme: "hand-edited-nonsense" }),
      }),
    );
    const res = await router.request("/event-types/intro-call");
    const body = (await res.json()) as { theme: string };
    expect(body.theme).toBe("default");
  });

  test("does not leak private config fields", async () => {
    const router = createAvailabilityRoutes(availabilityDeps());
    const body = (await (await router.request("/event-types/intro-call")).json()) as Record<
      string,
      unknown
    >;
    expect(Object.keys(body).sort()).toEqual(["durationMinutes", "slug", "theme", "title"]);
  });
});

const adminEventType: AdminEventType = {
  id: ET_ID,
  ownerUserId: U1,
  teamId: null,
  slug: "intro-call",
  title: "Intro call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  theme: "default",
  hosts: [{ userId: U1, role: "member", weight: 100, name: "Host", email: "host@example.test" }],
};

const validBody = {
  slug: "new-call",
  title: "New call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  teamId: null,
  hosts: [{ userId: U1, role: "member", weight: 100 }],
};

function adminDeps(): AdminDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: U1, email: "host@example.test", name: "Host" });
      await next();
    },
    listUsers: async () => [],
    listSchedulesForUser: async () => [],
    createSchedule: async () => {
      throw new Error("unused");
    },
    updateSchedule: async () => null,
    deleteSchedule: async () => "not_found",
    listTeamsForUser: async () => [],
    createTeam: async () => "slug_taken",
    isTeamMember: async () => false,
    listTeamMembers: async () => [],
    addTeamMember: async () => undefined,
    removeTeamMember: async () => "not_found",
    isTeamAdmin: async () => false,
    updateTeamMemberAdmin: async () => "not_found",
    listEventTypesForUser: async () => [adminEventType],
    getEventTypeForAdmin: async () => adminEventType,
    createEventType: async (_owner, input) => ({ ...adminEventType, ...input, hosts: adminEventType.hosts }),
    updateEventType: async (_id, _userId, input) => ({
      ...adminEventType,
      ...input,
      hosts: adminEventType.hosts,
    }),
    deleteEventType: async () => "not_found",
  };
}

describe("admin event-type theme", () => {
  function post(body: unknown, method = "POST", path = "/api/me/event-types") {
    return createAdminRoutes(adminDeps()).request(path, { method, body: JSON.stringify(body) });
  }

  test("accepts a bundled theme name and round-trips it", async () => {
    const res = await post({ ...validBody, theme: "sand" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { theme: string };
    expect(body.theme).toBe("sand");
  });

  test("rejects an unknown theme name", async () => {
    const res = await post({ ...validBody, theme: "neon" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_body");
  });

  test("omitted theme defaults instead of failing", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { theme: string };
    expect(body.theme).toBe("default");
  });

  test("update validates theme too", async () => {
    const res = await post({ ...validBody, theme: "neon" }, "PUT", `/api/me/event-types/${ET_ID}`);
    expect(res.status).toBe(400);
  });
});

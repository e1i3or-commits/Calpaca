import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import { createAvailabilityRoutes, type AvailabilityDeps } from "../../src/api/routes/availability";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function adminDeps(email: string): AdminDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: USER_ID, email, name: "Host" });
      await next();
    },
    listUsers: async () => [],
    listSchedulesForUser: async () => [],
    createSchedule: async () => { throw new Error("unused"); },
    updateSchedule: async () => null,
    deleteSchedule: async () => "not_found",
    listTeamsForUser: async () => [],
    createTeam: async () => "slug_taken",
    isTeamMember: async () => false,
    listTeamMembers: async () => [],
    addTeamMember: async () => undefined,
    removeTeamMember: async () => "not_found",
    isTeamAdmin: async () => false,
    isAppAdmin: async () => false,
    updateTeamMemberAdmin: async () => "not_found",
    listEventTypesForUser: async () => [],
    getEventTypeForAdmin: async () => null,
    createEventType: async () => { throw new Error("unused"); },
    updateEventType: async () => null,
    deleteEventType: async () => "not_found",
  };
}

describe("presentation options", () => {
  test("ordinary accounts receive public themes and all layouts", async () => {
    const response = await createAdminRoutes(adminDeps("host@example.com"))
      .request("/api/me/theme-options");
    const body = await response.json() as {
      themes: { value: string }[];
      layouts: { value: string }[];
    };
    expect(response.status).toBe(200);
    expect(body.themes.map((theme) => theme.value)).not.toContain("tourscale");
    expect(body.layouts.map((layout) => layout.value)).toEqual(["focus", "split", "compact"]);
  });

  test("TourScale accounts receive the private theme", async () => {
    const response = await createAdminRoutes(adminDeps("host@tourscale.com"))
      .request("/api/me/theme-options");
    const body = await response.json() as { themes: { value: string }[] };
    expect(body.themes.map((theme) => theme.value)).toContain("tourscale");
  });

  test("ordinary accounts cannot save the private theme directly", async () => {
    const response = await createAdminRoutes(adminDeps("host@example.com")).request(
      "/api/me/event-types",
      {
        method: "POST",
        body: JSON.stringify({
          slug: "intro",
          title: "Intro",
          durationMinutes: 30,
          bufferBeforeMin: 0,
          bufferAfterMin: 0,
          minimumNoticeMin: 0,
          rollingWindowDays: 14,
          mode: "solo",
          scheduleId: null,
          teamId: null,
          theme: "tourscale",
          layout: "focus",
          hosts: [{ userId: USER_ID, role: "member", weight: 100 }],
        }),
      },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "theme_not_available" });
  });

  test("public metadata carries a valid stored layout", async () => {
    const deps: AvailabilityDeps = {
      getEventTypeBySlug: async () => ({
        id: USER_ID,
        slug: "intro",
        title: "Intro",
        description: "A quick planning conversation.",
        theme: "juniper",
        layout: "split",
        logoUrl: "https://example.com/logo.svg",
        meetingFormats: ["phone", "google_meet"],
        mode: "solo",
        durationMinutes: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        minimumNoticeMin: 0,
        rollingWindowDays: 14,
        maxPerDay: null,
        curatedSlotCount: 3,
        publicSelectableHostIds: [],
      }),
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => Temporal.Instant.from("2027-01-01T00:00:00Z"),
    };
    const response = await createAvailabilityRoutes(deps).request("/event-types/intro");
    expect(await response.json()).toMatchObject({
      theme: "juniper",
      layout: "split",
      description: "A quick planning conversation.",
      logoUrl: "https://example.com/logo.svg",
      meetingFormats: ["phone", "google_meet"],
    });
  });

  test("TourScale metadata supplies its bundled logo when none is configured", async () => {
    const deps: AvailabilityDeps = {
      getEventTypeBySlug: async () => ({
        id: USER_ID,
        slug: "tour",
        title: "Tour",
        theme: "tourscale",
        mode: "solo",
        durationMinutes: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        minimumNoticeMin: 0,
        rollingWindowDays: 14,
        maxPerDay: null,
        curatedSlotCount: 3,
        publicSelectableHostIds: [],
      }),
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => Temporal.Instant.from("2027-01-01T00:00:00Z"),
    };
    const response = await createAvailabilityRoutes(deps).request("/event-types/tour");
    expect(await response.json()).toMatchObject({
      logoUrl: "/brand/tourscale-logo-color.svg",
    });
  });
});

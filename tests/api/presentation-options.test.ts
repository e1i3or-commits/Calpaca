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
      themes: { value: string; label: string }[];
      publicThemes: string[];
      layouts: { value: string }[];
    };
    expect(response.status).toBe(200);
    expect(body.themes.map((theme) => theme.value)).toEqual([
      "default", "midnight", "sand", "juniper", "solstice", "cobalt", "paper",
    ]);
    expect(body.themes).toHaveLength(7);
    expect(body.publicThemes).toEqual(body.themes.map((theme) => theme.value));
    expect(body.themes[0]).toEqual({ value: "default", label: "Default" });
    expect(body.themes.at(-1)).toEqual({ value: "paper", label: "Paper" });
    expect(body.layouts.map((layout) => layout.value)).toEqual(["focus", "split", "compact"]);
  });

  test("rejects a theme outside the public registry", async () => {
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
          theme: "private-client-theme",
          layout: "focus",
          hosts: [{ userId: USER_ID, role: "member", weight: 100 }],
        }),
      },
    );
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string; issues: unknown[] };
    expect(body.error).toBe("invalid_body");
    expect(body.issues.length).toBeGreaterThan(0);
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

});

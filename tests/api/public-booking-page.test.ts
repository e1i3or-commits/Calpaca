import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createAvailabilityRoutes } from "../../src/api/routes/availability";

describe("public workspace booking page", () => {
  test("returns the workspace event catalogue without requiring a session", async () => {
    const router = createAvailabilityRoutes({
      resolveWorkspaceId: async (_context, slug) => slug === "acme" ? "workspace-1" : undefined,
      getPublicBookingPage: async (workspaceId) => workspaceId === "workspace-1"
        ? {
            name: "Acme",
            slug: "acme",
            eventTypes: [{
              slug: "intro",
              title: "Intro call",
              description: "Meet the team.",
              durationMinutes: 30,
              selectableDurations: [15, 30, 60],
              theme: "default",
            }],
          }
        : null,
      getEventTypeBySlug: async () => null,
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => Temporal.Instant.from("2026-07-23T12:00:00Z"),
    });

    const response = await router.request("/booking-page?workspaceSlug=acme");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Acme",
      slug: "acme",
      eventTypes: [{
        slug: "intro",
        title: "Intro call",
        description: "Meet the team.",
        durationMinutes: 30,
        selectableDurations: [15, 30, 60],
        theme: "default",
      }],
      // Absent whitelabelEnabled resolves to false, so attribution is shown
      // rather than quietly dropped when the plan is unknown.
      whitelabel: false,
    });
  });

  test("reports white labeling from the workspace plan", async () => {
    const page = {
      name: "Acme",
      slug: "acme",
      eventTypes: [],
    };
    const router = (whitelabel: boolean) => createAvailabilityRoutes({
      resolveWorkspaceId: async () => "workspace-1",
      getPublicBookingPage: async () => page,
      whitelabelEnabled: async () => whitelabel,
      getEventTypeBySlug: async () => null,
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => Temporal.Instant.from("2026-07-23T12:00:00Z"),
    });
    expect(await (await router(true).request("/booking-page?workspaceSlug=acme")).json())
      .toMatchObject({ whitelabel: true });
    expect(await (await router(false).request("/booking-page?workspaceSlug=acme")).json())
      .toMatchObject({ whitelabel: false });
  });

  test("does not expose an unresolved workspace", async () => {
    const router = createAvailabilityRoutes({
      resolveWorkspaceId: async () => undefined,
      getEventTypeBySlug: async () => null,
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => Temporal.Instant.from("2026-07-23T12:00:00Z"),
    });
    expect((await router.request("/booking-page")).status).toBe(404);
  });
});

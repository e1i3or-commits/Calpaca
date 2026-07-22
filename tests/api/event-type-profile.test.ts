import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createAvailabilityRoutes, type AvailabilityDeps } from "../../src/api/routes/availability";
import type { EventTypeConfig, EventTypeProfile } from "../../src/db/availability-repo";

// The public meta endpoint's host/team profile: present when the (optional)
// profile dep is injected, absent otherwise so pre-profile fixtures — and the
// key-exact assertions in theming.test.ts — stay valid.

const ET_ID = "66666666-6666-4666-8666-666666666666";

const eventType: EventTypeConfig = {
  id: ET_ID,
  slug: "intro-call",
  title: "Intro call",
  theme: "default",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 14,
  maxPerDay: null,
  curatedSlotCount: 3,
  publicSelectableHostIds: [],
};

function deps(overrides: Partial<AvailabilityDeps> = {}): AvailabilityDeps {
  return {
    getEventTypeBySlug: async (slug) => (slug === "intro-call" ? eventType : null),
    getEventTypeHosts: async () => [],
    getSchedulesForUsers: async () => [],
    getBusyForUsers: async () => [],
    now: () => Temporal.Instant.from("2027-05-01T00:00Z"),
    ...overrides,
  };
}

describe("public event-type profile", () => {
  test("meta carries the profile when the dep provides one", async () => {
    const profile: EventTypeProfile = {
      teamName: "Sales",
      hosts: [
        { name: "Kai Apro", image: "https://example.com/kai.png" },
        { name: "Ada Lovelace", image: null },
      ],
    };
    const seen: string[] = [];
    const router = createAvailabilityRoutes(
      deps({
        getEventTypeProfile: async (eventTypeId) => {
          seen.push(eventTypeId);
          return profile;
        },
      }),
    );

    const res = await router.request("/event-types/intro-call");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: EventTypeProfile };
    expect(body.profile).toEqual(profile);
    expect(seen).toEqual([ET_ID]);
  });

  test("a solo host profile round-trips with a null team", async () => {
    const router = createAvailabilityRoutes(
      deps({
        getEventTypeProfile: async () => ({
          teamName: null,
          hosts: [{ name: "Kai Apro", image: null }],
        }),
      }),
    );

    const body = (await (await router.request("/event-types/intro-call")).json()) as {
      profile: EventTypeProfile;
    };
    expect(body.profile.teamName).toBeNull();
    expect(body.profile.hosts).toEqual([{ name: "Kai Apro", image: null }]);
  });

  test("meta omits the profile key entirely when the dep is absent", async () => {
    const router = createAvailabilityRoutes(deps());
    const body = (await (await router.request("/event-types/intro-call")).json()) as Record<
      string,
      unknown
    >;
    expect("profile" in body).toBe(false);
  });

  test("host emails never appear in the profile shape", async () => {
    const router = createAvailabilityRoutes(
      deps({
        getEventTypeProfile: async () => ({
          teamName: "Sales",
          hosts: [{ name: "Kai Apro", image: null }],
        }),
      }),
    );
    const body = (await (await router.request("/event-types/intro-call")).json()) as {
      profile: { hosts: Record<string, unknown>[] };
    };
    for (const host of body.profile.hosts) {
      expect(Object.keys(host).sort()).toEqual(["image", "name"]);
    }
  });
});

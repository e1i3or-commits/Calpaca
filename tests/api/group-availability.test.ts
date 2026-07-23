import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  createAvailabilityRoutes,
  type AvailabilityDeps,
} from "../../src/api/routes/availability";
import type {
  EventTypeConfig,
  EventTypeHostRecord,
  HostSchedule,
} from "../../src/db/availability-repo";

const NOW = Temporal.Instant.from("2027-01-04T00:00:00Z");
const WINDOW_START = "2027-01-04T00:00:00Z";
const WINDOW_END = "2027-01-05T00:00:00Z";

const groupEventType: EventTypeConfig = {
  id: "event-group",
  slug: "group-call",
  title: "Group call",
  mode: "group",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 1,
  maxPerDay: null,
  curatedSlotCount: 3,
  publicSelectableHostIds: ["host-a", "host-b"],
};

const hosts: EventTypeHostRecord[] = [
  {
    userId: "host-a",
    name: "Ada",
    image: "https://example.test/ada.png",
    role: "member",
    weight: 100,
  },
  {
    userId: "host-b",
    name: "Grace",
    image: null,
    role: "optional",
    weight: 100,
  },
  {
    userId: "host-private",
    name: "Private Host",
    image: null,
    role: "required",
    weight: 100,
  },
];

function schedule(
  userId: string,
  start: string,
  end: string,
): HostSchedule {
  return {
    userId,
    timezone: "UTC",
    rules: [{ dow: 1, start, end }],
  };
}

function deps(
  eventType: EventTypeConfig = groupEventType,
  schedules: readonly HostSchedule[] = [],
): AvailabilityDeps {
  return {
    getEventTypeBySlug: async (slug) =>
      slug === eventType.slug ? eventType : null,
    getEventTypeHosts: async () => hosts,
    getSchedulesForUsers: async (userIds) =>
      schedules.filter((row) => userIds.includes(row.userId)),
    getBusyForUsers: async () => [],
    now: () => NOW,
  };
}

function availabilityPath(): string {
  const query = new URLSearchParams({
    eventTypeSlug: groupEventType.slug,
    start: WINDOW_START,
    end: WINDOW_END,
    inviteeTimezone: "America/New_York",
  });
  query.append("hosts", "host-a");
  query.append("hosts", "host-b");
  return `/availability?${query.toString()}`;
}

describe("group booking public API", () => {
  test("meta exposes only allowlisted hosts with public identity and mapped roles", async () => {
    const router = createAvailabilityRoutes(deps());
    const response = await router.request("/event-types/group-call");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body["selectableHosts"]).toEqual([
      {
        id: "host-a",
        name: "Ada",
        image: "https://example.test/ada.png",
        role: "required",
      },
      {
        id: "host-b",
        name: "Grace",
        image: null,
        role: "optional",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("Private Host");
    expect(JSON.stringify(body)).not.toContain("email");
  });

  test("meta omits selectableHosts for solo and empty-allowlist group types", async () => {
    const solo = {
      ...groupEventType,
      slug: "solo-call",
      mode: "solo" as const,
    };
    const emptyGroup = {
      ...groupEventType,
      slug: "private-group",
      publicSelectableHostIds: [],
    };

    const soloBody = (await (
      await createAvailabilityRoutes(deps(solo)).request(
        "/event-types/solo-call",
      )
    ).json()) as Record<string, unknown>;
    const groupBody = (await (
      await createAvailabilityRoutes(deps(emptyGroup)).request(
        "/event-types/private-group",
      )
    ).json()) as Record<string, unknown>;

    expect("selectableHosts" in soloBody).toBe(false);
    expect("selectableHosts" in groupBody).toBe(false);
  });

  test("empty required-host intersection returns the best quorum fallback", async () => {
    const requiredHosts = hosts.map((host) => ({
      ...host,
      role: "required" as const,
    }));
    const routeDeps: AvailabilityDeps = {
      ...deps(groupEventType, [
        schedule("host-a", "09:00", "10:00"),
        schedule("host-b", "11:00", "12:00"),
      ]),
      getEventTypeHosts: async () => requiredHosts,
    };
    const response = await createAvailabilityRoutes(routeDeps).request(
      availabilityPath(),
    );
    const body = (await response.json()) as {
      all: unknown[];
      curated: unknown[];
      quorum: {
        missingHost: { id: string; name: string };
        slots: {
          start: { utc: string; invitee: string };
          score: number;
          localHourWarning: boolean;
        }[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.all).toEqual([]);
    expect(body.curated).toEqual([]);
    expect(body.quorum.missingHost).toEqual({
      id: "host-b",
      name: "Grace",
    });
    expect(body.quorum.slots.length).toBeGreaterThan(0);
    expect(body.quorum.slots[0]?.start.utc).toBe("2027-01-04T09:00:00Z");
    expect(body.quorum.slots[0]?.start.invitee).toContain(
      "[America/New_York]",
    );
    expect(typeof body.quorum.slots[0]?.score).toBe("number");
    expect(typeof body.quorum.slots[0]?.localHourWarning).toBe("boolean");
  });

  test("common availability omits the quorum key", async () => {
    const requiredHosts = hosts.map((host) => ({
      ...host,
      role: "required" as const,
    }));
    const routeDeps: AvailabilityDeps = {
      ...deps(groupEventType, [
        schedule("host-a", "09:00", "12:00"),
        schedule("host-b", "10:00", "12:00"),
      ]),
      getEventTypeHosts: async () => requiredHosts,
    };
    const body = (await (
      await createAvailabilityRoutes(routeDeps).request(availabilityPath())
    ).json()) as Record<string, unknown>;

    expect((body["all"] as unknown[]).length).toBeGreaterThan(0);
    expect("quorum" in body).toBe(false);
  });

  test("public role overrides let optional hosts score without gating", async () => {
    const requiredHosts = hosts.map((host) => ({
      ...host,
      role: "required" as const,
    }));
    const routeDeps: AvailabilityDeps = {
      ...deps(groupEventType, [
        schedule("host-a", "09:00", "10:00"),
        schedule("host-b", "11:00", "12:00"),
      ]),
      getEventTypeHosts: async () => requiredHosts,
    };
    const query = new URLSearchParams({
      eventTypeSlug: groupEventType.slug,
      start: WINDOW_START,
      end: WINDOW_END,
      inviteeTimezone: "UTC",
      overrideHostRoles: "true",
    });
    query.append("hosts", "host-a");
    query.append("hosts", "host-b");
    query.append("optionalHosts", "host-b");
    const body = (await (
      await createAvailabilityRoutes(routeDeps).request(
        `/availability?${query.toString()}`,
      )
    ).json()) as Record<string, unknown>;

    expect((body["all"] as unknown[]).length).toBeGreaterThan(0);
    expect("quorum" in body).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createAvailabilityRoutes, type AvailabilityDeps } from "../../src/api/routes/availability";
import type {
  EventTypeConfig,
  EventTypeHostRecord,
  HostBusy,
  HostSchedule,
} from "../../src/db/availability-repo";

/**
 * Route-level coverage per task 13: repos are injected via AvailabilityDeps
 * (never module-mocked), and every scenario is driven through app.request()
 * against a deterministic fixed clock. Fixture windows/rules are chosen so
 * expected scores are pinned by hand-verified core-engine output (see the
 * task's exploratory `bun -e` checks), not re-derived here.
 */

interface SlotDto {
  readonly start: { readonly utc: string; readonly invitee: string };
  readonly end: { readonly utc: string; readonly invitee: string };
  readonly score: number;
  readonly localHourWarning: boolean;
}

interface AvailabilityResponse {
  readonly curated: SlotDto[];
  readonly all: SlotDto[];
}

async function json(res: Response): Promise<AvailabilityResponse> {
  return (await res.json()) as AvailabilityResponse;
}

const NOW = Temporal.Instant.from("2027-01-04T00:00:00Z"); // Monday 00:00 UTC
const WINDOW_START = "2027-01-04T00:00:00Z";
const WINDOW_END = "2027-01-05T00:00:00Z";

const soloEventType: EventTypeConfig = {
  id: "et-solo",
  slug: "solo-30",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 1,
  maxPerDay: null,
  curatedSlotCount: 2,
  publicSelectableHostIds: [],
};

const groupEventType: EventTypeConfig = {
  id: "et-group",
  slug: "group-60",
  durationMinutes: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  rollingWindowDays: 1,
  maxPerDay: null,
  curatedSlotCount: 3,
  publicSelectableHostIds: ["host-b", "host-c"],
};

const eventTypesBySlug: Record<string, EventTypeConfig> = {
  "solo-30": soloEventType,
  "group-60": groupEventType,
};

const hostsByEventType: Record<string, EventTypeHostRecord[]> = {
  "et-solo": [{ userId: "host-a", role: "member", weight: 100 }],
  "et-group": [
    { userId: "host-b", role: "required", weight: 100 },
    { userId: "host-c", role: "required", weight: 100 },
  ],
};

const schedulesByUserId: Record<string, HostSchedule> = {
  "host-a": { userId: "host-a", timezone: "UTC", rules: [{ dow: 1, start: "09:00", end: "10:00" }] },
  "host-b": { userId: "host-b", timezone: "UTC", rules: [{ dow: 1, start: "09:00", end: "12:00" }] },
  "host-c": { userId: "host-c", timezone: "UTC", rules: [{ dow: 1, start: "11:00", end: "14:00" }] },
};

function makeDeps(): AvailabilityDeps {
  return {
    getEventTypeBySlug: async (slug) => eventTypesBySlug[slug] ?? null,
    getEventTypeHosts: async (eventTypeId) => hostsByEventType[eventTypeId] ?? [],
    getSchedulesForUsers: async (userIds) =>
      userIds.flatMap((id) => {
        const schedule = schedulesByUserId[id];
        return schedule ? [schedule] : [];
      }),
    getBusyForUsers: async (userIds): Promise<HostBusy[]> => userIds.map((id) => ({ userId: id, intervals: [] })),
    now: () => NOW,
  };
}

function baseParams(slug: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("eventTypeSlug", slug);
  params.set("start", WINDOW_START);
  params.set("end", WINDOW_END);
  params.set("inviteeTimezone", "UTC");
  return params;
}

describe("GET /availability", () => {
  test("solo: returns the host's own scored slots, curated to curatedSlotCount", async () => {
    const router = createAvailabilityRoutes(makeDeps());
    const res = await router.request(`/availability?${baseParams("solo-30").toString()}`);

    expect(res.status).toBe(200);
    const body = await json(res);

    // Three 30min candidates fit in the 09:00-10:00Z open block (15min grid);
    // the two edge-consuming slots (09:00, 09:30) outscore the fragmenting
    // middle one (09:15), so curated (top 2) is exactly those two, in order.
    expect(body.all).toHaveLength(3);
    expect(body.curated).toHaveLength(2);
    expect(body.curated.map((s) => s.start.utc)).toEqual([
      "2027-01-04T09:00:00Z",
      "2027-01-04T09:30:00Z",
    ]);
    expect(body.all[2]?.start.utc).toBe("2027-01-04T09:15:00Z");
  });

  test("timezone rendering: every slot carries both UTC and invitee-local renderings", async () => {
    const params = baseParams("solo-30");
    params.set("inviteeTimezone", "America/New_York");
    const router = createAvailabilityRoutes(makeDeps());
    const res = await router.request(`/availability?${params.toString()}`);
    const body = await json(res);

    const first = body.curated[0];
    const expectedInvitee = Temporal.Instant.from("2027-01-04T09:00:00Z")
      .toZonedDateTimeISO("America/New_York")
      .toString();
    expect(first?.start.utc).toBe("2027-01-04T09:00:00Z");
    expect(first?.start.invitee).toBe(expectedInvitee);
  });

  test("local-hour warning: flagged when invitee-local start falls outside 07:00-21:00, clear otherwise", async () => {
    const deps = makeDeps();

    const nyParams = baseParams("solo-30");
    nyParams.set("inviteeTimezone", "America/New_York");
    const nyRouter = createAvailabilityRoutes(deps);
    const nyBody = await json(await nyRouter.request(`/availability?${nyParams.toString()}`));
    // 09:00Z is 04:00 EST in January - outside reasonable local hours.
    expect(nyBody.curated[0]?.localHourWarning).toBe(true);

    const utcParams = baseParams("solo-30");
    const utcRouter = createAvailabilityRoutes(deps);
    const utcBody = await json(await utcRouter.request(`/availability?${utcParams.toString()}`));
    // Same slot, invitee timezone UTC: 09:00 local is within range.
    expect(utcBody.curated[0]?.localHourWarning).toBe(false);
  });

  test("group: hosts[] intersects required hosts' availability", async () => {
    const params = baseParams("group-60");
    params.append("hosts", "host-b");
    params.append("hosts", "host-c");
    const router = createAvailabilityRoutes(makeDeps());
    const res = await router.request(`/availability?${params.toString()}`);

    expect(res.status).toBe(200);
    const body = await json(res);

    // host-b is free 09:00-12:00Z, host-c 11:00-14:00Z; with a 60min
    // duration the only slot that fits the 1hr overlap is 11:00-12:00Z.
    expect(body.all).toHaveLength(1);
    expect(body.all[0]?.start.utc).toBe("2027-01-04T11:00:00Z");
    expect(body.all[0]?.end.utc).toBe("2027-01-04T12:00:00Z");
    expect(body.curated).toEqual(body.all);
  });

  test("allowlist: an unauthenticated hosts[] entry outside publicSelectableHostIds is rejected", async () => {
    const params = baseParams("group-60");
    params.append("hosts", "host-b");
    params.append("hosts", "host-d"); // not in publicSelectableHostIds
    const router = createAvailabilityRoutes(makeDeps());
    const res = await router.request(`/availability?${params.toString()}`);

    expect(res.status).toBe(403);
  });
});

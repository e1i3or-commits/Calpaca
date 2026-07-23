import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  createAvailabilityRoutes,
  type AvailabilityDeps,
} from "../../src/api/routes/availability";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import type {
  BookingEventTypeConfig,
  EventTypeConfig,
  HostSchedule,
} from "../../src/db/availability-repo";
import type { BookingRow } from "../../src/db/booking-repo";
import { ok } from "../../src/lib/result";

const NOW = Temporal.Instant.from("2027-01-04T08:00:00Z");
const SLOT = {
  start: "2027-01-04T09:00:00Z",
  end: "2027-01-04T09:30:00Z",
};

function eventType(
  agentPolicy?: BookingEventTypeConfig["agentPolicy"],
): BookingEventTypeConfig {
  return {
    id: "event-type-1",
    slug: "intro-call",
    durationMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minimumNoticeMin: 0,
    mode: "solo",
    publicSelectableHostIds: [],
    ...(agentPolicy ? { agentPolicy } : {}),
  };
}

const schedule: HostSchedule = {
  userId: "host-1",
  timezone: "UTC",
  rules: [{ dow: 1, start: "09:00", end: "17:00" }],
};

const booking: BookingRow = {
  id: "booking-1",
  eventTypeId: "event-type-1",
  startsAt: Temporal.Instant.from(SLOT.start),
  endsAt: Temporal.Instant.from(SLOT.end),
  inviteeEmail: "invitee@example.com",
  inviteeName: "Invitee",
  inviteeTimezone: "UTC",
  hostUserIds: ["host-1"],
  status: "confirmed",
  rescheduleToken: "reschedule-token",
  cancelToken: "cancel-token",
};

function bookingDeps(
  config: BookingEventTypeConfig,
  overrides: Partial<BookingDeps> = {},
): BookingDeps {
  return {
    getEventTypeForBooking: async (slug) =>
      slug === config.slug ? config : null,
    getEventTypeForBookingById: async () => config,
    getEventTypeHosts: async () => [
      { userId: "host-1", role: "member", weight: 100 },
    ],
    getSchedulesForUsers: async () => [schedule],
    getBusyForUsers: async () => [],
    createHold: async () => ok([{ id: "hold-1", hostUserId: "host-1" }]),
    confirmHold: async () =>
      ok({ bookingId: booking.id, hostUserIds: booking.hostUserIds }),
    confirmReschedule: async () =>
      ok({
        status: "confirmed",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        hostUserIds: booking.hostUserIds,
        inviteStatus: "none",
      }),
    cancelBooking: async () =>
      ok({
        status: "cancelled",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        hostUserIds: booking.hostUserIds,
        inviteStatus: "none",
      }),
    getBookingById: async () => booking,
    getBookingHistoryForHosts: async () => [],
    now: () => NOW,
    ...overrides,
  };
}

function post(
  router: ReturnType<typeof createBookingRoutes>,
  path: string,
  body: unknown,
) {
  return router.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const holdBody = {
  eventTypeSlug: "intro-call",
  ...SLOT,
};

const confirmBody = {
  eventTypeSlug: "intro-call",
  holdIds: ["hold-1"],
  invitee: {
    email: "invitee@example.com",
    name: "Invitee",
    timezone: "UTC",
  },
};

describe("agent policy", () => {
  test("disabled policy rejects agent hold and confirmation before writes", async () => {
    let holdWrites = 0;
    let bookingWrites = 0;
    const router = createBookingRoutes(
      bookingDeps(eventType({ enabled: false }), {
        createHold: async () => {
          holdWrites += 1;
          return ok([{ id: "hold-1", hostUserId: "host-1" }]);
        },
        confirmHold: async () => {
          bookingWrites += 1;
          return ok({ bookingId: booking.id, hostUserIds: booking.hostUserIds });
        },
      }),
    );

    const holdResponse = await post(router, "/holds", {
      ...holdBody,
      agent: true,
    });
    const bookingResponse = await post(router, "/bookings", {
      ...confirmBody,
      agent: true,
    });

    expect(holdResponse.status).toBe(403);
    expect(await holdResponse.json()).toEqual({ error: "agent_not_allowed" });
    expect(bookingResponse.status).toBe(403);
    expect(await bookingResponse.json()).toEqual({
      error: "agent_not_allowed",
    });
    expect(holdWrites).toBe(0);
    expect(bookingWrites).toBe(0);
  });

  test("non-agent hold and confirmation remain unaffected", async () => {
    const router = createBookingRoutes(
      bookingDeps(eventType({ enabled: false })),
    );

    expect((await post(router, "/holds", holdBody)).status).toBe(201);
    expect((await post(router, "/bookings", confirmBody)).status).toBe(201);
  });

  test("enabled policy clamps an agent hold to five minutes", async () => {
    let receivedTtl: Temporal.Duration | undefined;
    const router = createBookingRoutes(
      bookingDeps(
        eventType({ enabled: true, autoExpireHoldsMin: 5 }),
        {
          createHold: async (_eventTypeId, _hostUserIds, _slot, ttl) => {
            receivedTtl = ttl;
            return ok([{ id: "hold-1", hostUserId: "host-1" }]);
          },
        },
      ),
    );

    const response = await post(router, "/holds", {
      ...holdBody,
      agent: true,
    });
    const body = (await response.json()) as { expiresAt: string };

    expect(response.status).toBe(201);
    expect(receivedTtl?.total({ unit: "minutes" })).toBe(5);
    expect(body.expiresAt).toBe(NOW.add({ minutes: 5 }).toString());
  });

  test("public meta includes enabled state when policy exists", async () => {
    const config: EventTypeConfig = {
      ...eventType({ enabled: true, autoExpireHoldsMin: 5 }),
      title: "Intro call",
      rollingWindowDays: 14,
      maxPerDay: null,
      curatedSlotCount: 3,
    };
    const deps: AvailabilityDeps = {
      getEventTypeBySlug: async () => config,
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => NOW,
    };

    const body = (await (
      await createAvailabilityRoutes(deps).request(
        "/event-types/intro-call",
      )
    ).json()) as Record<string, unknown>;

    expect(body["agentPolicy"]).toEqual({ enabled: true });
  });

  test("public meta omits policy for fixture rows that lack it", async () => {
    const config: EventTypeConfig = {
      ...eventType(),
      title: "Intro call",
      rollingWindowDays: 14,
      maxPerDay: null,
      curatedSlotCount: 3,
    };
    const deps: AvailabilityDeps = {
      getEventTypeBySlug: async () => config,
      getEventTypeHosts: async () => [],
      getSchedulesForUsers: async () => [],
      getBusyForUsers: async () => [],
      now: () => NOW,
    };

    const body = (await (
      await createAvailabilityRoutes(deps).request(
        "/event-types/intro-call",
      )
    ).json()) as Record<string, unknown>;

    expect("agentPolicy" in body).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import type { BookingEventTypeConfig, EventTypeHostRecord, HostSchedule, HostBusy } from "../../src/db/availability-repo";
import type { HoldRecord, Invitee, ConfirmHoldError, ConfirmedBooking, RoundRobinAssignment } from "../../src/db/holds-repo";
import type { BookingRow } from "../../src/db/booking-repo";
import type { BookingState, BookingStateError } from "../../src/core/booking/state";
import type { BookingRecord } from "../../src/core/assignment/round-robin";
import { ok, err, type Result } from "../../src/lib/result";

/**
 * Route-level coverage per task 14 (same convention as task 13's
 * tests/api/availability.test.ts): every dependency is injected via
 * BookingDeps, never module-mocked, driven through router.request() against
 * a fixed clock.
 */

const NOW = Temporal.Instant.from("2027-01-04T00:00:00Z"); // Monday 00:00 UTC

const soloEventType: BookingEventTypeConfig = {
  id: "et-solo",
  slug: "solo-30",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  mode: "solo",
  publicSelectableHostIds: [],
};

const groupEventType: BookingEventTypeConfig = {
  id: "et-group",
  slug: "group-60",
  durationMinutes: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  mode: "group",
  publicSelectableHostIds: ["host-b", "host-c", "host-d"],
};

const roundRobinEventType: BookingEventTypeConfig = {
  id: "et-rr",
  slug: "rr-30",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  mode: "round_robin",
  publicSelectableHostIds: [],
};

const eventTypesBySlug: Record<string, BookingEventTypeConfig> = {
  "solo-30": soloEventType,
  "group-60": groupEventType,
  "rr-30": roundRobinEventType,
};

const eventTypesById: Record<string, BookingEventTypeConfig> = {
  "et-solo": soloEventType,
  "et-group": groupEventType,
  "et-rr": roundRobinEventType,
};

const hostsByEventType: Record<string, EventTypeHostRecord[]> = {
  "et-solo": [{ userId: "host-a", role: "member", weight: 100 }],
  "et-group": [
    { userId: "host-b", role: "required", weight: 100 },
    { userId: "host-c", role: "required", weight: 100 },
  ],
  "et-rr": [
    { userId: "host-x", role: "member", weight: 200 },
    { userId: "host-y", role: "member", weight: 100 },
  ],
};

const workingHours: HostSchedule["rules"] = [{ dow: 1, start: "09:00", end: "17:00" }];

const schedulesByUserId: Record<string, HostSchedule> = {
  "host-a": { userId: "host-a", timezone: "UTC", rules: workingHours },
  "host-b": { userId: "host-b", timezone: "UTC", rules: workingHours },
  "host-c": { userId: "host-c", timezone: "UTC", rules: workingHours },
  "host-d": { userId: "host-d", timezone: "UTC", rules: workingHours },
  "host-x": { userId: "host-x", timezone: "UTC", rules: workingHours },
  "host-y": { userId: "host-y", timezone: "UTC", rules: workingHours },
};

function iv(startIso: string, endIso: string) {
  return { start: Temporal.Instant.from(startIso), end: Temporal.Instant.from(endIso) };
}

function makeBooking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    eventTypeId: "et-solo",
    startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
    endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
    inviteeEmail: "invitee@example.com",
    inviteeName: "Invitee",
    inviteeTimezone: "UTC",
    hostUserIds: ["host-a"],
    status: "confirmed",
    rescheduleToken: "reschedule-token-123",
    cancelToken: "cancel-token-456",
    ...overrides,
  };
}

interface DepsOverrides {
  busyByUserId?: Record<string, ReturnType<typeof iv>[]>;
  bookingsById?: Record<string, BookingRow>;
  confirmHoldResult?: Result<ConfirmedBooking, ConfirmHoldError>;
  confirmRescheduleResult?: Result<BookingState, ConfirmHoldError | BookingStateError>;
  cancelBookingResult?: Result<BookingState, BookingStateError>;
  onConfirmHold?: (holdIds: readonly string[], invitee: Invitee, assignment?: RoundRobinAssignment) => void;
  bookingHistory?: readonly BookingRecord[];
}

function makeDeps(overrides: DepsOverrides = {}): BookingDeps {
  const busyByUserId = overrides.busyByUserId ?? {};
  const bookingsById = overrides.bookingsById ?? {};

  return {
    getEventTypeForBooking: async (slug) => eventTypesBySlug[slug] ?? null,
    getEventTypeForBookingById: async (id) => eventTypesById[id] ?? null,
    getEventTypeHosts: async (eventTypeId) => hostsByEventType[eventTypeId] ?? [],
    getSchedulesForUsers: async (userIds) =>
      userIds.flatMap((id) => {
        const schedule = schedulesByUserId[id];
        return schedule ? [schedule] : [];
      }),
    getBusyForUsers: async (userIds): Promise<HostBusy[]> =>
      userIds.map((id) => ({ userId: id, intervals: busyByUserId[id] ?? [] })),
    createHold: async (_eventTypeId, hostUserIds) =>
      ok(hostUserIds.map((hostUserId): HoldRecord => ({ id: `hold-${hostUserId}`, hostUserId }))),
    confirmHold: async (holdIds, invitee, assignment) => {
      overrides.onConfirmHold?.(holdIds, invitee, assignment);
      return overrides.confirmHoldResult ?? ok({ bookingId: "booking-1", hostUserIds: ["host-a"] });
    },
    confirmReschedule: async () =>
      overrides.confirmRescheduleResult ??
      ok({
        status: "confirmed",
        startsAt: Temporal.Instant.from("2027-01-04T10:00:00Z"),
        endsAt: Temporal.Instant.from("2027-01-04T10:30:00Z"),
        hostUserIds: ["host-a"],
        inviteStatus: "none",
      }),
    cancelBooking: async () =>
      overrides.cancelBookingResult ??
      ok({
        status: "cancelled",
        startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
        endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
        hostUserIds: ["host-a"],
        inviteStatus: "none",
      }),
    getBookingById: async (id) => bookingsById[id] ?? null,
    getBookingHistoryForHosts: async () => overrides.bookingHistory ?? [],
    now: () => NOW,
  };
}

async function post(router: ReturnType<typeof createBookingRoutes>, path: string, body: unknown) {
  return router.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /holds", () => {
  test("solo: creates a hold when the host is free", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/holds", {
      eventTypeSlug: "solo-30",
      start: "2027-01-04T09:00:00Z",
      end: "2027-01-04T09:30:00Z",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { holdIds: string[]; expiresAt: string };
    expect(body.holdIds).toEqual(["hold-host-a"]);
    expect(body.expiresAt).toBe(NOW.add({ minutes: 10 }).toString());
  });

  test("solo: 409 when the host is busy for the requested slot", async () => {
    const deps = makeDeps({ busyByUserId: { "host-a": [iv("2027-01-04T09:00:00Z", "2027-01-04T09:30:00Z")] } });
    const router = createBookingRoutes(deps);
    const res = await post(router, "/holds", {
      eventTypeSlug: "solo-30",
      start: "2027-01-04T09:00:00Z",
      end: "2027-01-04T09:30:00Z",
    });

    expect(res.status).toBe(409);
  });

  test("404 when the event type slug doesn't exist", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/holds", {
      eventTypeSlug: "nope",
      start: "2027-01-04T09:00:00Z",
      end: "2027-01-04T09:30:00Z",
    });
    expect(res.status).toBe(404);
  });

  test("400 when the requested window doesn't match the event type's duration", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/holds", {
      eventTypeSlug: "solo-30",
      start: "2027-01-04T09:00:00Z",
      end: "2027-01-04T10:00:00Z",
    });
    expect(res.status).toBe(400);
  });

  test("group: holds every required host when all are free", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/holds", {
      eventTypeSlug: "group-60",
      start: "2027-01-04T11:00:00Z",
      end: "2027-01-04T12:00:00Z",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { holdIds: string[] };
    expect(body.holdIds.slice().sort()).toEqual(["hold-host-b", "hold-host-c"]);
  });

  test("group: 409 when one required host is busy", async () => {
    const deps = makeDeps({ busyByUserId: { "host-c": [iv("2027-01-04T11:00:00Z", "2027-01-04T12:00:00Z")] } });
    const router = createBookingRoutes(deps);
    const res = await post(router, "/holds", {
      eventTypeSlug: "group-60",
      start: "2027-01-04T11:00:00Z",
      end: "2027-01-04T12:00:00Z",
    });
    expect(res.status).toBe(409);
  });

  test("group: 403 when a requested host isn't in the public allowlist", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/holds", {
      eventTypeSlug: "group-60",
      start: "2027-01-04T11:00:00Z",
      end: "2027-01-04T12:00:00Z",
      hosts: ["host-not-selectable"],
    });
    expect(res.status).toBe(403);
  });

  test("round robin: holds only the currently-free candidates, not the whole pool", async () => {
    const deps = makeDeps({ busyByUserId: { "host-x": [iv("2027-01-04T09:00:00Z", "2027-01-04T09:30:00Z")] } });
    const router = createBookingRoutes(deps);
    const res = await post(router, "/holds", {
      eventTypeSlug: "rr-30",
      start: "2027-01-04T09:00:00Z",
      end: "2027-01-04T09:30:00Z",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { holdIds: string[] };
    expect(body.holdIds).toEqual(["hold-host-y"]);
  });

  test("round robin: 409 when every candidate is busy", async () => {
    const deps = makeDeps({
      busyByUserId: {
        "host-x": [iv("2027-01-04T09:00:00Z", "2027-01-04T09:30:00Z")],
        "host-y": [iv("2027-01-04T09:00:00Z", "2027-01-04T09:30:00Z")],
      },
    });
    const router = createBookingRoutes(deps);
    const res = await post(router, "/holds", {
      eventTypeSlug: "rr-30",
      start: "2027-01-04T09:00:00Z",
      end: "2027-01-04T09:30:00Z",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /bookings", () => {
  test("confirms a hold and returns tokens plus both-timezone times", async () => {
    const bookingsById = {
      "booking-1": makeBooking({
        inviteeTimezone: "America/New_York",
        startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
        endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
      }),
    };
    const router = createBookingRoutes(makeDeps({ bookingsById }));
    const res = await post(router, "/bookings", {
      eventTypeSlug: "solo-30",
      holdIds: ["hold-host-a"],
      invitee: { email: "invitee@example.com", name: "Invitee", timezone: "America/New_York" },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      bookingId: string;
      rescheduleToken: string;
      cancelToken: string;
      start: { utc: string; invitee: string };
      emailSuggestion?: string;
    };
    expect(body.bookingId).toBe("booking-1");
    expect(body.rescheduleToken).toBe("reschedule-token-123");
    expect(body.cancelToken).toBe("cancel-token-456");
    expect(body.start.utc).toBe("2027-01-04T09:00:00Z");
    expect(body.start.invitee).toBe(
      Temporal.Instant.from("2027-01-04T09:00:00Z").toZonedDateTimeISO("America/New_York").toString(),
    );
    expect(body.emailSuggestion).toBeUndefined();
  });

  test("flags a common email domain typo without blocking the booking", async () => {
    const bookingsById = { "booking-1": makeBooking({ inviteeEmail: "invitee@gmial.com" }) };
    const router = createBookingRoutes(makeDeps({ bookingsById }));
    const res = await post(router, "/bookings", {
      eventTypeSlug: "solo-30",
      holdIds: ["hold-host-a"],
      invitee: { email: "invitee@gmial.com", name: "Invitee", timezone: "UTC" },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { emailSuggestion?: string };
    expect(body.emailSuggestion).toBe("invitee@gmail.com");
  });

  test("round robin: passes pool weights and booking history to confirmHold for in-transaction assignment", async () => {
    let captured: { holdIds: readonly string[]; assignment?: RoundRobinAssignment } | undefined;
    const history: BookingRecord[] = [{ userId: "host-x", bookedAt: Temporal.Instant.from("2027-01-01T00:00:00Z") }];
    const bookingsById = { "booking-1": makeBooking({ eventTypeId: "et-rr", hostUserIds: ["host-y"] }) };

    const deps = makeDeps({
      bookingsById,
      bookingHistory: history,
      onConfirmHold: (holdIds, _invitee, assignment) => {
        captured = { holdIds, assignment };
      },
    });
    const router = createBookingRoutes(deps);
    const res = await post(router, "/bookings", {
      eventTypeSlug: "rr-30",
      holdIds: ["hold-host-x", "hold-host-y"],
      invitee: { email: "invitee@example.com", name: "Invitee", timezone: "UTC" },
    });

    expect(res.status).toBe(201);
    expect(captured?.holdIds).toEqual(["hold-host-x", "hold-host-y"]);
    expect(captured?.assignment?.candidates.slice().sort((a, b) => (a.userId < b.userId ? -1 : 1))).toEqual([
      { userId: "host-x", weight: 200 },
      { userId: "host-y", weight: 100 },
    ]);
    expect(captured?.assignment?.history).toEqual(history);
  });

  test("409 when the hold expired before confirmation", async () => {
    const router = createBookingRoutes(makeDeps({ confirmHoldResult: err({ kind: "expired" }) }));
    const res = await post(router, "/bookings", {
      eventTypeSlug: "solo-30",
      holdIds: ["hold-host-a"],
      invitee: { email: "invitee@example.com", name: "Invitee", timezone: "UTC" },
    });
    expect(res.status).toBe(409);
  });

  test("404 when the hold ids don't resolve to any active hold", async () => {
    const router = createBookingRoutes(makeDeps({ confirmHoldResult: err({ kind: "not_found" }) }));
    const res = await post(router, "/bookings", {
      eventTypeSlug: "solo-30",
      holdIds: ["nonexistent"],
      invitee: { email: "invitee@example.com", name: "Invitee", timezone: "UTC" },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /bookings/:id/reschedule", () => {
  test("recomputes availability for the new slot, then confirms the reschedule", async () => {
    const bookingsById = { "booking-1": makeBooking() };
    const router = createBookingRoutes(makeDeps({ bookingsById }));
    const res = await post(router, "/bookings/booking-1/reschedule", {
      rescheduleToken: "reschedule-token-123",
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T10:30:00Z",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { start: { utc: string } };
    expect(body.start.utc).toBe("2027-01-04T10:00:00Z");
  });

  test("403 when the reschedule token doesn't match", async () => {
    const bookingsById = { "booking-1": makeBooking() };
    const router = createBookingRoutes(makeDeps({ bookingsById }));
    const res = await post(router, "/bookings/booking-1/reschedule", {
      rescheduleToken: "wrong-token",
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T10:30:00Z",
    });
    expect(res.status).toBe(403);
  });

  test("409 when the new slot's host is busy", async () => {
    const bookingsById = { "booking-1": makeBooking() };
    const deps = makeDeps({
      bookingsById,
      busyByUserId: { "host-a": [iv("2027-01-04T10:00:00Z", "2027-01-04T10:30:00Z")] },
    });
    const router = createBookingRoutes(deps);
    const res = await post(router, "/bookings/booking-1/reschedule", {
      rescheduleToken: "reschedule-token-123",
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T10:30:00Z",
    });
    expect(res.status).toBe(409);
  });

  test("409 with the typed reason when the booking already transitioned illegally (e.g. cancelled)", async () => {
    const bookingsById = { "booking-1": makeBooking() };
    const confirmRescheduleResult: Result<BookingState, ConfirmHoldError | BookingStateError> = err({
      kind: "rescheduled",
      reason: "booking_cancelled",
    });
    const router = createBookingRoutes(makeDeps({ bookingsById, confirmRescheduleResult }));
    const res = await post(router, "/bookings/booking-1/reschedule", {
      rescheduleToken: "reschedule-token-123",
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T10:30:00Z",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe("booking_cancelled");
  });

  test("404 when the booking id doesn't exist", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/bookings/nope/reschedule", {
      rescheduleToken: "whatever",
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T10:30:00Z",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /bookings/:id/cancel", () => {
  test("cancels with the right token", async () => {
    const bookingsById = { "booking-1": makeBooking() };
    const router = createBookingRoutes(makeDeps({ bookingsById }));
    const res = await post(router, "/bookings/booking-1/cancel", { cancelToken: "cancel-token-456" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("cancelled");
  });

  test("403 when the cancel token doesn't match", async () => {
    const bookingsById = { "booking-1": makeBooking() };
    const router = createBookingRoutes(makeDeps({ bookingsById }));
    const res = await post(router, "/bookings/booking-1/cancel", { cancelToken: "wrong-token" });
    expect(res.status).toBe(403);
  });

  test("409 when cancelling an already-cancelled booking, with the right token", async () => {
    const bookingsById = { "booking-1": makeBooking({ status: "cancelled" }) };
    const cancelBookingResult: Result<BookingState, BookingStateError> = err({
      kind: "cancelled",
      reason: "already_cancelled",
    });
    const router = createBookingRoutes(makeDeps({ bookingsById, cancelBookingResult }));
    const res = await post(router, "/bookings/booking-1/cancel", { cancelToken: "cancel-token-456" });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe("already_cancelled");
  });

  test("404 when the booking id doesn't exist", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await post(router, "/bookings/nope/cancel", { cancelToken: "whatever" });
    expect(res.status).toBe(404);
  });
});

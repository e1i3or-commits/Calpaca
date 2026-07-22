import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import type { BookingEventTypeConfig } from "../../src/db/availability-repo";
import type { BookingRow } from "../../src/db/booking-repo";
import { ok } from "../../src/lib/result";

/** GET /bookings/:id/reschedule-context (invite-email link target) plus the
 * enqueueInviteEmail hook — same injected-deps convention as bookings.test.ts. */

const eventType: BookingEventTypeConfig = {
  id: "et-solo",
  slug: "solo-30",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  mode: "solo",
  publicSelectableHostIds: [],
};

const booking: BookingRow = {
  id: "booking-1",
  eventTypeId: "et-solo",
  startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
  endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
  inviteeEmail: "invitee@example.com",
  inviteeName: "Invitee",
  inviteeTimezone: "America/New_York",
  hostUserIds: ["host-a"],
  status: "confirmed",
  rescheduleToken: "reschedule-token-123",
  cancelToken: "cancel-token-456",
};

function makeDeps(overrides: Partial<BookingDeps> = {}): BookingDeps {
  return {
    getEventTypeForBooking: async () => eventType,
    getEventTypeForBookingById: async (id) => (id === "et-solo" ? eventType : null),
    getEventTypeHosts: async () => [{ userId: "host-a", role: "member", weight: 100 }],
    getSchedulesForUsers: async () => [],
    getBusyForUsers: async () => [],
    createHold: async () => ok([{ id: "hold-1", hostUserId: "host-a" }]),
    confirmHold: async () => ok({ bookingId: "booking-1", hostUserIds: ["host-a"] }),
    confirmReschedule: async () =>
      ok({
        status: "confirmed",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        hostUserIds: ["host-a"],
        inviteStatus: "none",
      }),
    cancelBooking: async () =>
      ok({
        status: "cancelled",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        hostUserIds: ["host-a"],
        inviteStatus: "none",
      }),
    getBookingById: async (id) => (id === "booking-1" ? booking : null),
    getBookingHistoryForHosts: async () => [],
    now: () => Temporal.Instant.from("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("GET /bookings/:id/reschedule-context", () => {
  test("returns slug, duration, and both time renderings for a valid token", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await router.request(
      "/bookings/booking-1/reschedule-context?token=reschedule-token-123",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      eventTypeSlug: string;
      durationMinutes: number;
      start: { utc: string; invitee: string };
      inviteeTimezone: string;
    };
    expect(body.eventTypeSlug).toBe("solo-30");
    expect(body.durationMinutes).toBe(30);
    expect(body.start.utc).toBe("2027-01-04T09:00:00Z");
    expect(body.start.invitee).toContain("America/New_York");
    expect(body.inviteeTimezone).toBe("America/New_York");
  });

  test("403 on a wrong token, 400 without one, 404 for unknown booking", async () => {
    const router = createBookingRoutes(makeDeps());
    expect((await router.request("/bookings/booking-1/reschedule-context?token=nope")).status).toBe(403);
    expect((await router.request("/bookings/booking-1/reschedule-context")).status).toBe(400);
    expect((await router.request("/bookings/missing/reschedule-context?token=x")).status).toBe(404);
  });

  test("cancel token does not authorize the reschedule context", async () => {
    const router = createBookingRoutes(makeDeps());
    const res = await router.request(
      "/bookings/booking-1/reschedule-context?token=cancel-token-456",
    );
    expect(res.status).toBe(403);
  });
});

describe("invite email enqueue hooks", () => {
  test("cancel enqueues a cancelled invite email", async () => {
    const enqueued: [string, string][] = [];
    const router = createBookingRoutes(
      makeDeps({
        enqueueInviteEmail: async (bookingId, kind) => {
          enqueued.push([bookingId, kind]);
        },
      }),
    );
    const res = await router.request("/bookings/booking-1/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelToken: "cancel-token-456" }),
    });
    expect(res.status).toBe(200);
    expect(enqueued).toEqual([["booking-1", "cancelled"]]);
  });

  test("failed cancel does not enqueue an email", async () => {
    const enqueued: string[] = [];
    const router = createBookingRoutes(
      makeDeps({
        enqueueInviteEmail: async (bookingId) => {
          enqueued.push(bookingId);
        },
      }),
    );
    const res = await router.request("/bookings/booking-1/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelToken: "wrong" }),
    });
    expect(res.status).toBe(403);
    expect(enqueued).toEqual([]);
  });
});

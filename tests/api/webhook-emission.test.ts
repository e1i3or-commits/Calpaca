import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import type { BookingEventTypeConfig } from "../../src/db/availability-repo";
import type { BookingRow } from "../../src/db/booking-repo";
import { ok, err } from "../../src/lib/result";

/** The emitBookingWebhook hook on the cancel route — same injected-deps
 * convention as reschedule-context.test.ts. */

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

describe("booking webhook emission", () => {
  test("cancel emits a cancelled webhook carrying the reason", async () => {
    const emitted: unknown[] = [];
    const router = createBookingRoutes(
      makeDeps({
        emitBookingWebhook: async (bookingId, kind, opts) => {
          emitted.push([bookingId, kind, opts]);
        },
      }),
    );
    const res = await router.request("/bookings/booking-1/cancel", {
      method: "POST",
      body: JSON.stringify({ cancelToken: "cancel-token-456", reason: "conflict" }),
    });
    expect(res.status).toBe(200);
    expect(emitted).toEqual([["booking-1", "cancelled", { reason: "conflict" }]]);
  });

  test("a failed cancel emits nothing", async () => {
    const emitted: unknown[] = [];
    const router = createBookingRoutes(
      makeDeps({
        cancelBooking: async () => err({ kind: "cancelled" as const, reason: "already_cancelled" as const }),
        emitBookingWebhook: async (...args) => {
          emitted.push(args);
        },
      }),
    );
    const res = await router.request("/bookings/booking-1/cancel", {
      method: "POST",
      body: JSON.stringify({ cancelToken: "cancel-token-456" }),
    });
    expect(res.status).toBe(409);
    expect(emitted).toEqual([]);
  });

  test("routes work without the optional hook wired", async () => {
    const router = createBookingRoutes(makeDeps({ emitBookingWebhook: undefined }));
    const res = await router.request("/bookings/booking-1/cancel", {
      method: "POST",
      body: JSON.stringify({ cancelToken: "cancel-token-456" }),
    });
    expect(res.status).toBe(200);
  });
});

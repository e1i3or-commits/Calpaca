import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import type { BookingEventTypeConfig } from "../../src/db/availability-repo";
import { ok } from "../../src/lib/result";

const NOW = Temporal.Instant.from("2027-01-04T08:00:00Z");
const eventType: BookingEventTypeConfig = {
  id: "event-group",
  slug: "group-call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  mode: "group",
  publicSelectableHostIds: ["host-a", "host-b"],
};

describe("group hold role overrides", () => {
  test("holds a free required host without gating on a busy optional host", async () => {
    let heldHosts: readonly string[] = [];
    const deps: BookingDeps = {
      getEventTypeForBooking: async () => eventType,
      getEventTypeForBookingById: async () => eventType,
      getEventTypeHosts: async () => [
        { userId: "host-a", role: "required", weight: 100 },
        { userId: "host-b", role: "required", weight: 100 },
      ],
      getSchedulesForUsers: async (userIds) =>
        userIds.map((userId) => ({
          userId,
          timezone: "UTC",
          rules: [{ dow: 1, start: "09:00", end: "10:00" }],
        })),
      getBusyForUsers: async () => [
        {
          userId: "host-b",
          intervals: [
            {
              start: Temporal.Instant.from("2027-01-04T09:00:00Z"),
              end: Temporal.Instant.from("2027-01-04T09:30:00Z"),
            },
          ],
        },
      ],
      createHold: async (_eventTypeId, hostUserIds) => {
        heldHosts = hostUserIds;
        return ok(
          hostUserIds.map((hostUserId) => ({
            id: `hold-${hostUserId}`,
            hostUserId,
          })),
        );
      },
      confirmHold: async () =>
        ok({ bookingId: "booking-1", hostUserIds: ["host-a"] }),
      confirmReschedule: async () => {
        throw new Error("unused");
      },
      cancelBooking: async () => {
        throw new Error("unused");
      },
      getBookingById: async () => null,
      getBookingHistoryForHosts: async () => [],
      now: () => NOW,
    };
    const response = await createBookingRoutes(deps).request("/holds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeSlug: "group-call",
        start: "2027-01-04T09:00:00Z",
        end: "2027-01-04T09:30:00Z",
        hosts: ["host-a", "host-b"],
        optionalHosts: ["host-b"],
      }),
    });

    expect(response.status).toBe(201);
    expect(heldHosts).toEqual(["host-a"]);
    expect(((await response.json()) as { holdIds: string[] }).holdIds).toEqual([
      "hold-host-a",
    ]);
  });
});

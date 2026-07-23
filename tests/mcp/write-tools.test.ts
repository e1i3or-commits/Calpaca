import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import type { BookingEventTypeConfig, HostSchedule } from "../../src/db/availability-repo";
import type { BookingRow } from "../../src/db/booking-repo";
import { ok } from "../../src/lib/result";
import { createSchedulerMcpServer } from "../../src/mcp/server";

const NOW = Temporal.Instant.from("2027-01-04T08:00:00Z");
const INITIAL = {
  start: Temporal.Instant.from("2027-01-04T09:00:00Z"),
  end: Temporal.Instant.from("2027-01-04T09:30:00Z"),
};
const MOVED = {
  start: Temporal.Instant.from("2027-01-04T10:00:00Z"),
  end: Temporal.Instant.from("2027-01-04T10:30:00Z"),
};

const enabledEventType: BookingEventTypeConfig = {
  id: "event-enabled",
  slug: "enabled-call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 0,
  mode: "solo",
  publicSelectableHostIds: [],
  agentPolicy: { enabled: true, autoExpireHoldsMin: 5 },
};

const disabledEventType: BookingEventTypeConfig = {
  ...enabledEventType,
  id: "event-disabled",
  slug: "disabled-call",
  agentPolicy: { enabled: false },
};

const schedule: HostSchedule = {
  userId: "host-1",
  timezone: "UTC",
  rules: [{ dow: 1, start: "09:00", end: "17:00" }],
};

const clients: Client[] = [];
const servers: ReturnType<typeof createSchedulerMcpServer>[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

interface Fixture {
  readonly client: Client;
  readonly requestBodies: Record<string, unknown>[];
}

async function fixture(): Promise<Fixture> {
  let booking: BookingRow | null = null;
  let pendingSlot = INITIAL;
  let holdNumber = 0;
  const requestBodies: Record<string, unknown>[] = [];

  const deps: BookingDeps = {
    getEventTypeForBooking: async (slug) => {
      if (slug === enabledEventType.slug) return enabledEventType;
      if (slug === disabledEventType.slug) return disabledEventType;
      return null;
    },
    getEventTypeForBookingById: async (id) =>
      id === enabledEventType.id ? enabledEventType : null,
    getEventTypeHosts: async () => [
      { userId: "host-1", role: "member", weight: 100 },
    ],
    getSchedulesForUsers: async () => [schedule],
    getBusyForUsers: async () => [],
    createHold: async (_eventTypeId, _hostUserIds, slot) => {
      pendingSlot = slot;
      holdNumber += 1;
      return ok([{ id: `hold-${holdNumber}`, hostUserId: "host-1" }]);
    },
    confirmHold: async (_holdIds, invitee) => {
      booking = {
        id: "booking-1",
        eventTypeId: enabledEventType.id,
        startsAt: pendingSlot.start,
        endsAt: pendingSlot.end,
        inviteeEmail: invitee.email,
        inviteeName: invitee.name,
        inviteeTimezone: invitee.timezone,
        inviteeNotes: invitee.notes,
        hostUserIds: ["host-1"],
        status: "confirmed",
        rescheduleToken: "reschedule-token",
        cancelToken: "cancel-token",
      };
      return ok({ bookingId: booking.id, hostUserIds: booking.hostUserIds });
    },
    confirmReschedule: async () => {
      if (!booking) throw new Error("test fixture has no booking to reschedule");
      booking = {
        ...booking,
        startsAt: pendingSlot.start,
        endsAt: pendingSlot.end,
      };
      return ok({
        status: "confirmed",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        hostUserIds: booking.hostUserIds,
        inviteStatus: "none",
      });
    },
    cancelBooking: async () => {
      if (!booking) throw new Error("test fixture has no booking to cancel");
      booking = { ...booking, status: "cancelled" };
      return ok({
        status: "cancelled",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        hostUserIds: booking.hostUserIds,
        inviteStatus: "none",
      });
    },
    getBookingById: async (id) => (booking?.id === id ? booking : null),
    getBookingHistoryForHosts: async () => [],
    now: () => NOW,
  };

  const app = createBookingRoutes(deps);
  const appFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input.toString(), init);
    if (request.method === "POST") {
      requestBodies.push(
        (await request.clone().json()) as Record<string, unknown>,
      );
    }
    return app.fetch(request);
  }) as typeof fetch;
  const server = createSchedulerMcpServer({
    baseUrl: "http://scheduler.test",
    fetch: appFetch,
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  servers.push(server);
  return { client, requestBodies };
}

function body(result: unknown): Record<string, unknown> {
  return (result as { structuredContent: Record<string, unknown> })
    .structuredContent;
}

describe("MCP write tools", () => {
  test("hold, confirm, reschedule, and cancel complete through the API", async () => {
    const { client, requestBodies } = await fixture();
    const hold = await client.callTool({
      name: "create_hold",
      arguments: {
        eventTypeSlug: "enabled-call",
        start: INITIAL.start.toString(),
        end: INITIAL.end.toString(),
      },
    });
    const confirmed = await client.callTool({
      name: "confirm_booking",
      arguments: {
        eventTypeSlug: "enabled-call",
        holdIds: body(hold)["holdIds"],
        invitee: {
          email: "invitee@example.com",
          name: "Invitee",
          timezone: "America/New_York",
          notes: "Discuss launch",
        },
      },
    });
    const confirmation = body(confirmed);
    const rescheduled = await client.callTool({
      name: "reschedule_booking",
      arguments: {
        bookingId: confirmation["bookingId"],
        rescheduleToken: confirmation["rescheduleToken"],
        start: MOVED.start.toString(),
        end: MOVED.end.toString(),
      },
    });
    const cancelled = await client.callTool({
      name: "cancel_booking",
      arguments: {
        bookingId: confirmation["bookingId"],
        cancelToken: confirmation["cancelToken"],
        reason: "Plans changed",
      },
    });

    expect(hold.isError).not.toBe(true);
    expect(body(hold)["holdIds"]).toEqual(["hold-1"]);
    expect(confirmed.isError).not.toBe(true);
    expect(confirmation["start"]).toEqual({
      utc: INITIAL.start.toString(),
      invitee: INITIAL.start
        .toZonedDateTimeISO("America/New_York")
        .toString(),
    });
    expect(rescheduled.isError).not.toBe(true);
    expect(body(rescheduled)["start"]).toEqual({
      utc: MOVED.start.toString(),
      invitee: MOVED.start
        .toZonedDateTimeISO("America/New_York")
        .toString(),
    });
    expect(cancelled.isError).not.toBe(true);
    expect(body(cancelled)).toEqual({
      bookingId: "booking-1",
      status: "cancelled",
    });
    expect(requestBodies).toHaveLength(4);
    expect(requestBodies.every((request) => request["agent"] === true)).toBe(
      true,
    );
  });

  test("disabled event type preserves agent_not_allowed as the tool error", async () => {
    const { client } = await fixture();
    const response = await client.callTool({
      name: "create_hold",
      arguments: {
        eventTypeSlug: "disabled-call",
        start: INITIAL.start.toString(),
        end: INITIAL.end.toString(),
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      { type: "text", text: "agent_not_allowed" },
    ]);
  });

  test("agent hold expiry respects the event type policy", async () => {
    const { client } = await fixture();
    const response = await client.callTool({
      name: "create_hold",
      arguments: {
        eventTypeSlug: "enabled-call",
        start: INITIAL.start.toString(),
        end: INITIAL.end.toString(),
      },
    });
    const expiresAt = Temporal.Instant.from(body(response)["expiresAt"] as string);

    expect(response.isError).not.toBe(true);
    expect(Temporal.Instant.compare(expiresAt, NOW.add({ minutes: 5 }))).toBeLessThanOrEqual(0);
    expect(Temporal.Instant.compare(expiresAt, NOW)).toBeGreaterThan(0);
  });
});

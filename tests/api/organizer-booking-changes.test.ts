import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { asc, eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import type { BookingDeps } from "../../src/api/routes/bookings";
import type { BookingEventTypeConfig, HostBusy, HostSchedule } from "../../src/db/availability-repo";
import type { ConfirmHoldError, HoldRecord } from "../../src/db/holds-repo";
import { confirmReschedule, createHold } from "../../src/db/holds-repo";
import {
  appendEvent,
  getOrganizerBookingAccess,
  type BookingRow,
  type OrganizerBookingAccess,
} from "../../src/db/booking-repo";
import {
  err,
  ok,
  type BookingActor,
  type BookingState,
  type BookingStateError,
  type Result,
} from "@calpaca/core";
import * as schema from "../../src/db/schema";

/**
 * Organizer-side cancel and reschedule. Mirrors the invitee token-route
 * coverage in tests/api/bookings.test.ts (same availability fixtures, same
 * fixed clock) and adds the host / workspace-admin permission cases.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
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

const schedule: HostSchedule = {
  userId: USER_ID,
  timezone: "UTC",
  rules: [{ dow: 1, start: "09:00", end: "17:00" }],
};

function iv(startIso: string, endIso: string) {
  return { start: Temporal.Instant.from(startIso), end: Temporal.Instant.from(endIso) };
}

function makeBooking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: BOOKING_ID,
    eventTypeId: "et-solo",
    startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
    endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
    inviteeEmail: "invitee@example.com",
    inviteeName: "Invitee",
    inviteeTimezone: "America/New_York",
    hostUserIds: [USER_ID],
    status: "confirmed",
    rescheduleToken: "reschedule-token-123",
    cancelToken: "cancel-token-456",
    ...overrides,
  };
}

interface Calls {
  cancel: { reason: string | undefined; actor: BookingActor | undefined }[];
  reschedule: { holdIds: readonly string[]; actor: BookingActor | undefined }[];
  emails: string[];
  webhooks: { kind: string; opts: unknown }[];
}

function makeBookingDeps(
  calls: Calls,
  overrides: {
    busy?: ReturnType<typeof iv>[];
    booking?: BookingRow | null;
    cancelResult?: Result<BookingState, BookingStateError>;
    rescheduleResult?: Result<BookingState, ConfirmHoldError | BookingStateError>;
  } = {},
): BookingDeps {
  const booking = overrides.booking === undefined ? makeBooking() : overrides.booking;
  return {
    getEventTypeForBooking: async () => soloEventType,
    getEventTypeForBookingById: async (id) => (id === "et-solo" ? soloEventType : null),
    getEventTypeHosts: async () => [{ userId: USER_ID, role: "member", weight: 100 }],
    getSchedulesForUsers: async (userIds) => userIds.includes(USER_ID) ? [schedule] : [],
    getBusyForUsers: async (userIds): Promise<HostBusy[]> =>
      userIds.map((userId) => ({ userId, intervals: overrides.busy ?? [] })),
    createHold: async (_eventTypeId, hostUserIds) =>
      ok(hostUserIds.map((hostUserId): HoldRecord => ({ id: `hold-${hostUserId}`, hostUserId }))),
    confirmHold: async () => ok({ bookingId: BOOKING_ID, hostUserIds: [USER_ID] }),
    confirmReschedule: async (_bookingId, holdIds, actor) => {
      calls.reschedule.push({ holdIds, actor });
      return overrides.rescheduleResult ?? ok({
        status: "confirmed",
        startsAt: Temporal.Instant.from("2027-01-04T10:00:00Z"),
        endsAt: Temporal.Instant.from("2027-01-04T10:30:00Z"),
        hostUserIds: [USER_ID],
        inviteStatus: "none",
      });
    },
    cancelBooking: async (_bookingId, reason, actor) => {
      calls.cancel.push({ reason, actor });
      return overrides.cancelResult ?? ok({
        status: "cancelled",
        startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
        endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
        hostUserIds: [USER_ID],
        inviteStatus: "none",
      });
    },
    getBookingById: async (id) => (booking && id === booking.id ? booking : null),
    getBookingHistoryForHosts: async () => [],
    now: () => NOW,
    enqueueInviteEmail: async (_bookingId, kind) => {
      calls.emails.push(kind);
    },
    emitBookingWebhook: async (_bookingId, kind, opts) => {
      calls.webhooks.push({ kind, opts });
    },
  };
}

function makeRouter(
  options: {
    access?: OrganizerBookingAccess | null;
    authenticated?: boolean;
    bookingDeps?: Parameters<typeof makeBookingDeps>[1];
  } = {},
) {
  const calls: Calls = { cancel: [], reschedule: [], emails: [], webhooks: [] };
  const authenticated = options.authenticated ?? true;
  const requireAuth: AdminDeps["requireAuth"] = authenticated
    ? async (c, next) => {
        c.set("user", { id: USER_ID, email: "host@example.test", name: "Host", workspaceId: "ws-1" });
        await next();
      }
    : async (c) => c.json({ error: "unauthorized" }, 401);
  const accessCalls: { bookingId: string; userId: string; workspaceId?: string }[] = [];
  const deps = {
    requireAuth,
    now: () => NOW,
    getOrganizerBookingAccess: async (bookingId: string, userId: string, workspaceId?: string) => {
      accessCalls.push({ bookingId, userId, ...(workspaceId ? { workspaceId } : {}) });
      return options.access === undefined ? "host" : options.access;
    },
    bookingChanges: makeBookingDeps(calls, options.bookingDeps),
  } as unknown as AdminDeps;
  return { router: createAdminRoutes(deps), calls, accessCalls };
}

async function post(router: ReturnType<typeof createAdminRoutes>, path: string, body?: unknown) {
  return router.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const organizer: BookingActor = { kind: "organizer", userId: USER_ID };

describe("POST /api/me/bookings/:id/cancel", () => {
  test("a host cancels with a reason; the organizer is recorded and the invitee is notified", async () => {
    const { router, calls, accessCalls } = makeRouter();
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, { reason: "Host is sick" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bookingId: BOOKING_ID, status: "cancelled" });
    expect(accessCalls).toEqual([{ bookingId: BOOKING_ID, userId: USER_ID, workspaceId: "ws-1" }]);
    expect(calls.cancel).toEqual([{ reason: "Host is sick", actor: organizer }]);
    expect(calls.emails).toEqual(["cancelled"]);
    expect(calls.webhooks).toEqual([
      { kind: "cancelled", opts: { reason: "Host is sick", actor: organizer } },
    ]);
  });

  test("the body is optional and a blank reason is dropped", async () => {
    const { router, calls } = makeRouter();
    expect((await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`)).status).toBe(200);
    expect((await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, { reason: "   " })).status).toBe(200);
    expect(calls.cancel).toEqual([
      { reason: undefined, actor: organizer },
      { reason: undefined, actor: organizer },
    ]);
  });

  test("a workspace admin who is not a host may cancel", async () => {
    const { router, calls } = makeRouter({ access: "workspace_admin" });
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, {});
    expect(res.status).toBe(200);
    expect(calls.cancel).toHaveLength(1);
  });

  test("403 for someone who can see the booking but neither hosts it nor administers the workspace", async () => {
    const { router, calls } = makeRouter({ access: "viewer" });
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, {});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_booking_host" });
    expect(calls.cancel).toHaveLength(0);
    expect(calls.emails).toHaveLength(0);
  });

  test("404 when the booking is not visible, does not exist, or the id is malformed", async () => {
    const hidden = makeRouter({ access: null });
    const res = await post(hidden.router, `/api/me/bookings/${BOOKING_ID}/cancel`, {});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "booking_not_found" });

    const missing = makeRouter({ bookingDeps: { booking: null } });
    expect((await post(missing.router, `/api/me/bookings/${BOOKING_ID}/cancel`, {})).status).toBe(404);

    const malformed = makeRouter();
    expect((await post(malformed.router, "/api/me/bookings/not-a-uuid/cancel", {})).status).toBe(404);
    expect(malformed.accessCalls).toHaveLength(0);
  });

  test("409 with the typed reason when the booking is already cancelled", async () => {
    const { router, calls } = makeRouter({
      bookingDeps: { cancelResult: err({ kind: "cancelled", reason: "already_cancelled" }) },
    });
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "illegal_transition", reason: "already_cancelled" });
    expect(calls.emails).toHaveLength(0);
    expect(calls.webhooks).toHaveLength(0);
  });

  test("400 when the reason is not a string", async () => {
    const { router } = makeRouter();
    expect((await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, { reason: 7 })).status).toBe(400);
  });

  test("requires authentication", async () => {
    const { router, calls } = makeRouter({ authenticated: false });
    expect((await post(router, `/api/me/bookings/${BOOKING_ID}/cancel`, {})).status).toBe(401);
    expect(calls.cancel).toHaveLength(0);
  });
});

describe("POST /api/me/bookings/:id/reschedule", () => {
  test("recomputes availability for the new slot, records the organizer, and notifies", async () => {
    const { router, calls } = makeRouter();
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule?timezone=America/Chicago`, {
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T10:30:00Z",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      bookingId: BOOKING_ID,
      status: "confirmed",
      hostUserIds: [USER_ID],
      start: { utc: "2027-01-04T10:00:00Z", invitee: "2027-01-04T04:00:00-06:00[America/Chicago]" },
      end: { utc: "2027-01-04T10:30:00Z", invitee: "2027-01-04T04:30:00-06:00[America/Chicago]" },
    });
    expect(calls.reschedule).toEqual([{ holdIds: [`hold-${USER_ID}`], actor: organizer }]);
    expect(calls.emails).toEqual(["rescheduled"]);
    expect(calls.webhooks).toEqual([{ kind: "rescheduled", opts: { actor: organizer } }]);
  });

  test("end defaults to start plus the booking's current duration", async () => {
    const { router, calls } = makeRouter();
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {
      start: "2027-01-04T13:00:00Z",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { end: { utc: string } };
    expect(body.end.utc).toBe("2027-01-04T13:30:00Z");
    expect(calls.reschedule).toHaveLength(1);
  });

  test("409 when the host is busy at the new time", async () => {
    const { router, calls } = makeRouter({
      bookingDeps: { busy: [iv("2027-01-04T10:00:00Z", "2027-01-04T10:30:00Z")] },
    });
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {
      start: "2027-01-04T10:00:00Z",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "slot_not_available" });
    expect(calls.reschedule).toHaveLength(0);
    expect(calls.emails).toHaveLength(0);
  });

  test("409 outside the host's working hours, same as the invitee path", async () => {
    const { router } = makeRouter();
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {
      start: "2027-01-04T20:00:00Z",
    });
    expect(res.status).toBe(409);
  });

  test("400 when the new window changes the duration or is malformed", async () => {
    const { router } = makeRouter();
    const longer = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {
      start: "2027-01-04T10:00:00Z",
      end: "2027-01-04T11:00:00Z",
    });
    expect(longer.status).toBe(400);
    expect(await longer.json()).toEqual({ error: "duration_mismatch" });

    const garbage = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, { start: "tomorrow" });
    expect(garbage.status).toBe(400);
    expect(await garbage.json()).toEqual({ error: "invalid_window" });

    expect((await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {})).status).toBe(400);
    expect(
      (await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule?timezone=Mars/Base`, {
        start: "2027-01-04T10:00:00Z",
      })).status,
    ).toBe(400);
  });

  test("409 with the typed reason when the booking was already cancelled", async () => {
    const { router, calls } = makeRouter({
      bookingDeps: { rescheduleResult: err({ kind: "rescheduled", reason: "booking_cancelled" }) },
    });
    const res = await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {
      start: "2027-01-04T10:00:00Z",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "illegal_transition", reason: "booking_cancelled" });
    expect(calls.emails).toHaveLength(0);
  });

  test("a workspace admin may reschedule; a viewer gets 403 and an outsider 404", async () => {
    const admin = makeRouter({ access: "workspace_admin" });
    expect(
      (await post(admin.router, `/api/me/bookings/${BOOKING_ID}/reschedule`, { start: "2027-01-04T10:00:00Z" })).status,
    ).toBe(200);

    const viewer = makeRouter({ access: "viewer" });
    const forbidden = await post(viewer.router, `/api/me/bookings/${BOOKING_ID}/reschedule`, {
      start: "2027-01-04T10:00:00Z",
    });
    expect(forbidden.status).toBe(403);
    expect(viewer.calls.reschedule).toHaveLength(0);

    const outsider = makeRouter({ access: null });
    expect(
      (await post(outsider.router, `/api/me/bookings/${BOOKING_ID}/reschedule`, { start: "2027-01-04T10:00:00Z" })).status,
    ).toBe(404);
  });

  test("requires authentication", async () => {
    const { router } = makeRouter({ authenticated: false });
    expect(
      (await post(router, `/api/me/bookings/${BOOKING_ID}/reschedule`, { start: "2027-01-04T10:00:00Z" })).status,
    ).toBe(401);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("organizer booking changes persistence", () => {
  test("access resolves host, workspace admin, viewer and outsider; events record the organizer", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(
        sql`truncate table ${schema.holds}, ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes}, ${schema.teamMembers}, ${schema.teams}, ${schema.workspaceMembers}, ${schema.users}, ${schema.workspaces} restart identity cascade`,
      );
      const [workspace] = await db.insert(schema.workspaces)
        .values({ name: "Organizer changes", slug: "organizer-changes" })
        .returning();
      const [other] = await db.insert(schema.workspaces)
        .values({ name: "Elsewhere", slug: "organizer-changes-elsewhere" })
        .returning();
      if (!workspace || !other) throw new Error("failed to create workspaces");
      const people = await db.insert(schema.users).values([
        { email: "host@organizer.test", name: "Host" },
        { email: "admin@organizer.test", name: "Admin" },
        { email: "teammate@organizer.test", name: "Teammate" },
        { email: "stranger@organizer.test", name: "Stranger" },
      ]).returning();
      const [host, admin, teammate, stranger] = people;
      if (!host || !admin || !teammate || !stranger) throw new Error("failed to create users");
      await db.insert(schema.workspaceMembers).values([
        { workspaceId: workspace.id, userId: host.id, role: "member" },
        { workspaceId: workspace.id, userId: admin.id, role: "admin" },
        { workspaceId: workspace.id, userId: teammate.id, role: "member" },
        { workspaceId: workspace.id, userId: stranger.id, role: "member" },
      ]);
      const [team] = await db.insert(schema.teams)
        .values({ workspaceId: workspace.id, name: "Ops", slug: "ops" })
        .returning();
      if (!team) throw new Error("failed to create team");
      await db.insert(schema.teamMembers).values([
        { teamId: team.id, userId: host.id },
        { teamId: team.id, userId: teammate.id },
      ]);
      const [eventType] = await db.insert(schema.eventTypes).values({
        workspaceId: workspace.id,
        ownerUserId: host.id,
        teamId: team.id,
        slug: "organizer-intro",
        title: "Organizer intro",
        durationMinutes: 30,
      }).returning();
      if (!eventType) throw new Error("failed to create event type");

      const startsAt = Temporal.Now.instant().add({ hours: 72 }).round({ smallestUnit: "minute" });
      const endsAt = startsAt.add({ minutes: 30 });
      const [booking] = await db.insert(schema.bookings).values({
        workspaceId: workspace.id,
        eventTypeId: eventType.id,
        startsAt: new Date(startsAt.epochMilliseconds),
        endsAt: new Date(endsAt.epochMilliseconds),
        inviteeEmail: "invitee@organizer.test",
        inviteeName: "Invitee",
        inviteeTimezone: "UTC",
        hostUserIds: [host.id],
        rescheduleToken: "reschedule-organizer",
        cancelToken: "cancel-organizer",
      }).returning();
      if (!booking) throw new Error("failed to create booking");
      expect((await appendEvent(booking.id, "created", { startsAt, endsAt, hostUserIds: [host.id] }, db)).ok)
        .toBe(true);

      expect(await getOrganizerBookingAccess(booking.id, host.id, db, workspace.id)).toBe("host");
      expect(await getOrganizerBookingAccess(booking.id, admin.id, db, workspace.id)).toBe("workspace_admin");
      expect(await getOrganizerBookingAccess(booking.id, teammate.id, db, workspace.id)).toBe("viewer");
      expect(await getOrganizerBookingAccess(booking.id, stranger.id, db, workspace.id)).toBeNull();
      expect(await getOrganizerBookingAccess(booking.id, host.id, db, other.id)).toBeNull();

      // Reschedule through the same hold + confirm path the invitee route uses.
      const nextStart = startsAt.add({ hours: 2 });
      const holds = await createHold(
        eventType.id,
        [host.id],
        { start: nextStart, end: nextStart.add({ minutes: 30 }) },
        Temporal.Duration.from({ minutes: 10 }),
        db,
      );
      if (!holds.ok) throw new Error(`hold failed: ${holds.error.kind}`);
      const moved = await confirmReschedule(
        booking.id,
        holds.value.map((hold) => hold.id),
        db,
        { kind: "organizer", userId: admin.id },
      );
      expect(moved.ok).toBe(true);

      const cancelled = await appendEvent(
        booking.id,
        "cancelled",
        { reason: "Host unavailable", actor: { kind: "organizer", userId: host.id } },
        db,
      );
      expect(cancelled.ok).toBe(true);

      const [projection] = await db
        .select({ status: schema.bookings.status, startsAt: schema.bookings.startsAt })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, booking.id));
      expect(projection?.status).toBe("cancelled");
      expect(projection?.startsAt.getTime()).toBe(nextStart.epochMilliseconds);

      const events = await db
        .select({ kind: schema.bookingEvents.kind, payload: schema.bookingEvents.payload })
        .from(schema.bookingEvents)
        .where(eq(schema.bookingEvents.bookingId, booking.id))
        .orderBy(asc(schema.bookingEvents.createdAt), asc(schema.bookingEvents.id));
      expect(events.map((event) => event.kind)).toEqual(["created", "rescheduled", "cancelled"]);
      expect((events[1]?.payload as { actor?: unknown }).actor).toEqual({ kind: "organizer", userId: admin.id });
      expect(events[2]?.payload).toEqual({
        reason: "Host unavailable",
        actor: { kind: "organizer", userId: host.id },
      });
    } finally {
      await pool.end();
    }
  });
});

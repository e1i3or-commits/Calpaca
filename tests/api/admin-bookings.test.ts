import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import {
  getBookingDetailForUser,
  listBookingsForUser,
  markBookingNoShowForUser,
  type AdminBookingDetail,
  type AdminBookingPage,
} from "../../src/db/booking-repo";
import { appendEvent } from "../../src/db/booking-repo";
import { err, ok } from "../../src/lib/result";
import * as schema from "../../src/db/schema";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Temporal.Instant.from("2027-01-04T12:00:00Z");

const row: AdminBookingPage["bookings"][number] = {
  id: BOOKING_ID,
  eventType: { slug: "intro", title: "Intro call" },
  startsAt: Temporal.Instant.from("2027-01-03T15:00:00Z"),
  endsAt: Temporal.Instant.from("2027-01-03T15:30:00Z"),
  inviteeName: "Invitee",
  inviteeEmail: "invitee@example.test",
  hostUserIds: [USER_ID],
  status: "cancelled",
  inviteStatus: "delivered",
};

const detail: AdminBookingDetail = {
  ...row,
  inviteeTimezone: "America/Los_Angeles",
  inviteeNotes: "Bring the launch plan",
  routingAnswers: { companySize: "20" },
  hasGoogleEvent: true,
  events: [
    {
      kind: "created",
      payload: { startsAt: "2027-01-03T15:00:00Z" },
      createdAt: Temporal.Instant.from("2027-01-01T10:00:00Z"),
    },
    {
      kind: "invite_delivered",
      payload: {},
      createdAt: Temporal.Instant.from("2027-01-01T10:01:00Z"),
    },
  ],
};

function makeDeps(overrides: Partial<AdminDeps> = {}, authenticated = true): AdminDeps {
  const requireAuth: AdminDeps["requireAuth"] = authenticated
    ? async (c, next) => {
        c.set("user", { id: USER_ID, email: "host@example.test", name: "Host" });
        await next();
      }
    : async (c) => c.json({ error: "unauthorized" }, 401);

  return {
    requireAuth,
    now: () => NOW,
    listBookingsForUser: async () => ({ bookings: [row], total: 1 }),
    getBookingDetailForUser: async () => detail,
    markBookingNoShowForUser: async () =>
      ok({
        status: "no_show",
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        hostUserIds: row.hostUserIds,
        inviteStatus: "delivered",
      }),
    ...overrides,
  } as unknown as AdminDeps;
}

describe("admin booking routes", () => {
  test("list validates filters, pagination, and requester timezone rendering", async () => {
    let captured: Parameters<NonNullable<AdminDeps["listBookingsForUser"]>>[0] | undefined;
    const router = createAdminRoutes(makeDeps({
      listBookingsForUser: async (input) => {
        captured = input;
        return { bookings: [row], total: 3 };
      },
    }));

    const response = await router.request(
      "/api/me/bookings?filter=past&status=cancelled&page=2&pageSize=1&timezone=America%2FNew_York",
    );
    expect(response.status).toBe(200);
    expect(captured).toEqual({
      userId: USER_ID,
      filter: "past",
      status: "cancelled",
      page: 2,
      pageSize: 1,
      now: NOW,
    });
    const body = (await response.json()) as {
      bookings: { start: { utc: string; invitee: string } }[];
      page: number;
      pageSize: number;
      total: number;
    };
    expect(body).toMatchObject({ page: 2, pageSize: 1, total: 3 });
    expect(body.bookings[0]?.start.utc).toBe("2027-01-03T15:00:00Z");
    expect(body.bookings[0]?.start.invitee).toContain("[America/New_York]");
  });

  test("detail carries invite status, private fields, and ordered timeline", async () => {
    const router = createAdminRoutes(makeDeps());
    const response = await router.request(`/api/me/bookings/${BOOKING_ID}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown> & {
      events: { kind: string; payload: unknown; createdAt: string }[];
    };
    expect(body.inviteStatus).toBe("delivered");
    expect(body.inviteeNotes).toBe("Bring the launch plan");
    expect(body.routingAnswers).toEqual({ companySize: "20" });
    expect(body.hasGoogleEvent).toBe(true);
    expect(body.events).toEqual([
      { kind: "created", payload: { startsAt: "2027-01-03T15:00:00Z" }, createdAt: "2027-01-01T10:00:00Z" },
      { kind: "invite_delivered", payload: {}, createdAt: "2027-01-01T10:01:00Z" },
    ]);
  });

  test("no-show succeeds through the event dependency and emits its webhook", async () => {
    const emitted: unknown[] = [];
    const router = createAdminRoutes(makeDeps({
      emitBookingWebhook: async (...args) => {
        emitted.push(args);
      },
    }));
    const response = await router.request(`/api/me/bookings/${BOOKING_ID}/no-show`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bookingId: BOOKING_ID, status: "no_show" });
    expect(emitted).toEqual([[BOOKING_ID, "no_show"]]);
  });

  test("no-show on a cancelled booking returns the state-machine reason", async () => {
    const router = createAdminRoutes(makeDeps({
      markBookingNoShowForUser: async () =>
        err({ kind: "no_show", reason: "booking_cancelled" }),
    }));
    const response = await router.request(`/api/me/bookings/${BOOKING_ID}/no-show`, {
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "booking_cancelled" });
  });

  test("list, detail, and no-show all require authentication", async () => {
    const router = createAdminRoutes(makeDeps({}, false));
    expect((await router.request("/api/me/bookings")).status).toBe(401);
    expect((await router.request(`/api/me/bookings/${BOOKING_ID}`)).status).toBe(401);
    expect(
      (await router.request(`/api/me/bookings/${BOOKING_ID}/no-show`, { method: "POST" })).status,
    ).toBe(401);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("admin booking persistence", () => {
  test("scoped list/detail read the projection and no-show appends the event", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(
        sql`truncate table ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes}, ${schema.users} restart identity cascade`,
      );
      const [owner] = await db
        .insert(schema.users)
        .values({ email: "admin-bookings@example.test", name: "Admin" })
        .returning();
      if (!owner) throw new Error("failed to create owner");
      const [eventType] = await db
        .insert(schema.eventTypes)
        .values({
          ownerUserId: owner.id,
          slug: "admin-intro",
          title: "Admin intro",
          durationMinutes: 30,
        })
        .returning();
      if (!eventType) throw new Error("failed to create event type");
      const startsAt = NOW.subtract({ hours: 1 });
      const endsAt = NOW.subtract({ minutes: 30 });
      const [booking] = await db
        .insert(schema.bookings)
        .values({
          eventTypeId: eventType.id,
          startsAt: new Date(startsAt.epochMilliseconds),
          endsAt: new Date(endsAt.epochMilliseconds),
          inviteeEmail: "invitee-admin@example.test",
          inviteeName: "Invitee Admin",
          inviteeTimezone: "UTC",
          inviteeNotes: "Persistence note",
          hostUserIds: [owner.id],
          rescheduleToken: "reschedule-admin",
          cancelToken: "cancel-admin",
          routingAnswers: { source: "docs" },
        })
        .returning();
      if (!booking) throw new Error("failed to create booking");
      const created = await appendEvent(
        booking.id,
        "created",
        { startsAt, endsAt, hostUserIds: [owner.id] },
        db,
      );
      expect(created.ok).toBe(true);

      const page = await listBookingsForUser({
        userId: owner.id,
        filter: "past",
        page: 1,
        pageSize: 20,
        now: NOW,
      }, db);
      expect(page.total).toBe(1);
      expect(page.bookings[0]?.id).toBe(booking.id);

      const before = await getBookingDetailForUser(booking.id, owner.id, db);
      expect(before?.inviteeNotes).toBe("Persistence note");
      expect(before?.events.map((event) => event.kind)).toEqual(["created"]);

      const marked = await markBookingNoShowForUser(booking.id, owner.id, db);
      expect(marked?.ok).toBe(true);
      const [projection] = await db
        .select({ status: schema.bookings.status })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, booking.id));
      expect(projection?.status).toBe("no_show");
      const after = await getBookingDetailForUser(booking.id, owner.id, db);
      expect(after?.events.map((event) => event.kind)).toEqual(["created", "no_show"]);
    } finally {
      await pool.end();
    }
  });
});

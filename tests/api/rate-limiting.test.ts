import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingRoutes, type BookingDeps } from "../../src/api/routes/bookings";
import { bucketStart, decide } from "../../src/core/ratelimit/window";
import {
  countActiveHoldsForEventType,
  createHold,
  expireHolds,
} from "../../src/db/holds-repo";
import {
  incrementRateLimit,
  reapRateLimits,
} from "../../src/db/rate-limit-repo";
import { ok } from "../../src/lib/result";
import * as schema from "../../src/db/schema";

const NOW = Temporal.Instant.from("2027-01-04T08:00:00Z");

function makeDeps(overrides: Partial<BookingDeps> = {}): BookingDeps {
  const counts = new Map<string, number>();
  return {
    getEventTypeForBooking: async () => ({
      id: "event-type-1",
      slug: "intro",
      durationMinutes: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      minimumNoticeMin: 0,
      mode: "solo",
      publicSelectableHostIds: [],
    }),
    getEventTypeForBookingById: async () => null,
    getEventTypeHosts: async () => [{ userId: "host-1", role: "member", weight: 100 }],
    getSchedulesForUsers: async () => [{
      userId: "host-1",
      timezone: "UTC",
      rules: [{ dow: 1, start: "00:00", end: "23:59" }],
    }],
    getBusyForUsers: async () => [{ userId: "host-1", intervals: [] }],
    createHold: async () => ok([{ id: "hold-1", hostUserId: "host-1" }]),
    confirmHold: async () => ok({ bookingId: "booking-1", hostUserIds: ["host-1"] }),
    confirmReschedule: async () => {
      throw new Error("not used");
    },
    cancelBooking: async () => {
      throw new Error("not used");
    },
    getBookingById: async () => ({
      id: "booking-1",
      eventTypeId: "event-type-1",
      startsAt: Temporal.Instant.from("2027-01-04T09:00:00Z"),
      endsAt: Temporal.Instant.from("2027-01-04T09:30:00Z"),
      inviteeEmail: "invitee@example.test",
      inviteeName: "Invitee",
      inviteeTimezone: "UTC",
      hostUserIds: ["host-1"],
      status: "confirmed",
      rescheduleToken: "reschedule-token",
      cancelToken: "cancel-token",
    }),
    getBookingHistoryForHosts: async () => [],
    now: () => NOW,
    checkRateLimit: async (key, now, limit, windowSeconds) => {
      const bucket = bucketStart(now, windowSeconds);
      const mapKey = `${key}:${bucket.toString()}`;
      const count = (counts.get(mapKey) ?? 0) + 1;
      counts.set(mapKey, count);
      return decide(count, limit, 60);
    },
    countActiveHoldsForEventType: async () => 0,
    ...overrides,
  };
}

const holdBody = {
  eventTypeSlug: "intro",
  start: "2027-01-04T09:00:00Z",
  end: "2027-01-04T09:30:00Z",
};

const bookingBody = {
  eventTypeSlug: "intro",
  holdIds: ["hold-1"],
  invitee: { email: "invitee@example.test", name: "Invitee", timezone: "UTC" },
};

function post(router: ReturnType<typeof createBookingRoutes>, path: string, body: unknown, ip: string) {
  return router.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `${ip}, 10.0.0.1`,
    },
    body: JSON.stringify(body),
  });
}

describe("public write rate limiting", () => {
  test("N+1 requests exceed each route cap with retryAfterSeconds", async () => {
    const router = createBookingRoutes(makeDeps());

    for (let i = 0; i < 20; i += 1) {
      expect((await post(router, "/holds", holdBody, "192.0.2.1")).status).toBe(201);
    }
    const held = await post(router, "/holds", holdBody, "192.0.2.1");
    expect(held.status).toBe(429);
    expect(await held.json()).toEqual({ error: "rate_limited", retryAfterSeconds: 60 });

    for (let i = 0; i < 10; i += 1) {
      expect((await post(router, "/bookings", bookingBody, "192.0.2.2")).status).toBe(201);
    }
    const booked = await post(router, "/bookings", bookingBody, "192.0.2.2");
    expect(booked.status).toBe(429);
    expect(await booked.json()).toEqual({ error: "rate_limited", retryAfterSeconds: 60 });
  });

  test("distinct forwarded first-hop IPs do not share buckets", async () => {
    const router = createBookingRoutes(makeDeps());

    for (let i = 0; i < 20; i += 1) {
      expect((await post(router, "/holds", holdBody, "192.0.2.10")).status).toBe(201);
    }
    expect((await post(router, "/holds", holdBody, "192.0.2.10")).status).toBe(429);
    expect((await post(router, "/holds", holdBody, "192.0.2.11")).status).toBe(201);
  });

  test("active-hold ceiling rejects before creating another hold", async () => {
    let createCalls = 0;
    const router = createBookingRoutes(makeDeps({
      countActiveHoldsForEventType: async () => 50,
      createHold: async () => {
        createCalls += 1;
        return ok([{ id: "hold-1", hostUserId: "host-1" }]);
      },
    }));

    const response = await post(router, "/holds", holdBody, "192.0.2.20");
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "holds_exhausted" });
    expect(createCalls).toBe(0);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("hold expiry under load", () => {
  test("reaps about 200 expired holds and capacity opens for a new hold", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(
        sql`truncate table ${schema.holds}, ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes}, ${schema.users} restart identity cascade`,
      );
      const [host] = await db
        .insert(schema.users)
        .values({ email: "rate-host@example.test", name: "Rate Host" })
        .returning();
      if (!host) throw new Error("failed to create host");
      const eventTypes = await db
        .insert(schema.eventTypes)
        .values([
          { slug: "rate-a", title: "Rate A", durationMinutes: 30 },
          { slug: "rate-b", title: "Rate B", durationMinutes: 30 },
        ])
        .returning();
      if (!eventTypes[0] || !eventTypes[1]) throw new Error("failed to create event types");

      const expiredAt = new Date(NOW.subtract({ seconds: 1 }).epochMilliseconds);
      await db.insert(schema.holds).values(
        Array.from({ length: 200 }, (_, index) => ({
          eventTypeId: eventTypes[index % 2]!.id,
          hostUserId: host.id,
          slotStart: new Date(NOW.add({ minutes: index }).epochMilliseconds),
          slotEnd: new Date(NOW.add({ minutes: index + 1 }).epochMilliseconds),
          expiresAt: expiredAt,
        })),
      );

      expect(await countActiveHoldsForEventType(eventTypes[0].id, NOW, db)).toBe(0);
      expect(await expireHolds(NOW, db)).toBe(200);
      const expired = await db
        .select()
        .from(schema.holds)
        .where(and(eq(schema.holds.status, "expired")));
      expect(expired).toHaveLength(200);

      const created = await createHold(
        eventTypes[0].id,
        [host.id],
        {
          start: NOW.add({ hours: 5 }),
          end: NOW.add({ hours: 5, minutes: 30 }),
        },
        Temporal.Duration.from({ minutes: 10 }),
        db,
      );
      expect(created.ok).toBe(true);
    } finally {
      await pool.end();
    }
  });

  test("parallel rate-limit increments are atomic and old buckets reap", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`truncate table ${schema.rateLimits}`);
      const bucket = bucketStart(NOW, 60);
      const counts = await Promise.all(
        Array.from({ length: 25 }, () => incrementRateLimit("holds:192.0.2.30", bucket, db)),
      );

      expect(counts.slice().sort((a, b) => a - b)).toEqual(
        Array.from({ length: 25 }, (_, index) => index + 1),
      );
      expect(await reapRateLimits(bucket.add({ seconds: 60 }), db)).toBe(1);
    } finally {
      await pool.end();
    }
  });
});

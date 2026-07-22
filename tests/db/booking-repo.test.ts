import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as schema from "../../src/db/schema";
import { appendEvent, rebuildProjection } from "../../src/db/booking-repo";
import { generateToken } from "../../src/lib/id";

/**
 * Integration coverage for appendEvent/rebuildProjection against a real
 * Postgres instance. The pure state machine (tests/core/booking/state.test.ts)
 * carries the transition-legality coverage for this task; these tests only
 * exercise the transaction + projection glue, so they need a real database
 * and SKIP cleanly without one (same convention task 12's holds-repo will use).
 * Idempotent against a database of unknown state: migrations run
 * programmatically, and affected tables are truncated before the test.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("booking-repo", () => {
  test("appendEvent persists an event and updates the bookings projection", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });

    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`truncate table ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes} restart identity cascade`);

      const [eventType] = await db
        .insert(schema.eventTypes)
        .values({ slug: "test-event", title: "Test event", durationMinutes: 30 })
        .returning();
      if (!eventType) throw new Error("failed to insert event type fixture");

      const startsAt = Temporal.Instant.from("2027-04-01T10:00Z");
      const endsAt = Temporal.Instant.from("2027-04-01T10:30Z");

      const [booking] = await db
        .insert(schema.bookings)
        .values({
          eventTypeId: eventType.id,
          startsAt: new Date(startsAt.epochMilliseconds),
          endsAt: new Date(endsAt.epochMilliseconds),
          inviteeEmail: "invitee@example.com",
          inviteeName: "Invitee",
          inviteeTimezone: "UTC",
          hostUserIds: ["host-1"],
          rescheduleToken: generateToken(),
          cancelToken: generateToken(),
        })
        .returning();
      if (!booking) throw new Error("failed to insert booking fixture");

      const created = await appendEvent(booking.id, "created", { startsAt, endsAt, hostUserIds: ["host-1"] }, db);
      expect(created.ok).toBe(true);

      const cancelled = await appendEvent(booking.id, "cancelled", {}, db);
      expect(cancelled.ok).toBe(true);
      if (cancelled.ok) expect(cancelled.value.status).toBe("cancelled");

      const doubleCancel = await appendEvent(booking.id, "cancelled", {}, db);
      expect(doubleCancel).toEqual({ ok: false, error: { kind: "cancelled", reason: "already_cancelled" } });

      const [projected] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id));
      expect(projected?.status).toBe("cancelled");

      const rebuilt = await rebuildProjection(booking.id, db);
      expect(rebuilt.ok).toBe(true);
      if (rebuilt.ok) expect(rebuilt.value.status).toBe("cancelled");
    } finally {
      await pool.end();
    }
  });
});

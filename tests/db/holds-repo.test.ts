import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as schema from "../../src/db/schema";
import { confirmHold, confirmReschedule, createHold } from "../../src/db/holds-repo";

/**
 * Integration coverage for the transactional hold/confirm path against a
 * real Postgres instance (same convention as tests/db/booking-repo.test.ts):
 * SKIPs cleanly without TEST_DATABASE_URL, runs migrations programmatically,
 * and truncates affected tables before the test so it's idempotent against a
 * database of unknown state.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("holds-repo", () => {
  async function setup() {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });

    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(
      sql`truncate table ${schema.holds}, ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes}, ${schema.users} restart identity cascade`,
    );

    const [eventType] = await db
      .insert(schema.eventTypes)
      .values({ slug: "test-event", title: "Test event", durationMinutes: 30 })
      .returning();
    if (!eventType) throw new Error("failed to insert event type fixture");

    const hostRows = await db
      .insert(schema.users)
      .values([
        { email: "host1@example.com", name: "Host One" },
        { email: "host2@example.com", name: "Host Two" },
        { email: "host3@example.com", name: "Host Three" },
      ])
      .returning();
    const [host1, host2, host3] = hostRows;
    if (!host1 || !host2 || !host3) throw new Error("failed to insert host fixtures");

    return { pool, db, eventType, host1, host2, host3 };
  }

  const slot = {
    start: Temporal.Instant.from("2027-05-01T10:00Z"),
    end: Temporal.Instant.from("2027-05-01T10:30Z"),
  };
  const ttl = Temporal.Duration.from({ minutes: 10 });
  const invitee = { email: "invitee@example.com", name: "Invitee", timezone: "UTC" };

  test("two concurrent createHold calls for the same host+slot produce exactly one winner", async () => {
    const { pool, db, eventType, host1 } = await setup();

    try {
      const [resultA, resultB] = await Promise.all([
        createHold(eventType.id, [host1.id], slot, ttl, db),
        createHold(eventType.id, [host1.id], slot, ttl, db),
      ]);

      const outcomes = [resultA, resultB];
      const winners = outcomes.filter((r) => r.ok);
      const losers = outcomes.filter((r) => !r.ok);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      if (!losers[0]?.ok) expect(losers[0]?.error).toEqual({ kind: "slot_taken" });

      const rows = await db
        .select()
        .from(schema.holds)
        .where(eq(schema.holds.hostUserId, host1.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("active");
    } finally {
      await pool.end();
    }
  });

  test("capacity event admits only the configured number of concurrent holds", async () => {
    const { pool, db, eventType, host1 } = await setup();
    try {
      await db.update(schema.eventTypes).set({ capacity: 2 })
        .where(eq(schema.eventTypes.id, eventType.id));
      const outcomes = await Promise.all([
        createHold(eventType.id, [host1.id], slot, ttl, db),
        createHold(eventType.id, [host1.id], slot, ttl, db),
        createHold(eventType.id, [host1.id], slot, ttl, db),
      ]);
      expect(outcomes.filter((result) => result.ok)).toHaveLength(2);
      expect(outcomes.filter((result) => !result.ok)).toHaveLength(1);
      expect(await db.select().from(schema.holds)).toHaveLength(2);
    } finally {
      await pool.end();
    }
  });

  test("confirm after expiry fails", async () => {
    const { pool, db, eventType, host1 } = await setup();

    try {
      const expiredTtl = Temporal.Duration.from({ seconds: -60 });
      const created = await createHold(eventType.id, [host1.id], slot, expiredTtl, db);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const confirmed = await confirmHold(
        created.value.map((h) => h.id),
        invitee,
        db,
      );
      expect(confirmed).toEqual({ ok: false, error: { kind: "expired" } });

      const rows = await db.select().from(schema.holds).where(eq(schema.holds.hostUserId, host1.id));
      expect(rows[0]?.status).toBe("active");
    } finally {
      await pool.end();
    }
  });

  test("confirmHold creates a booking and marks the hold confirmed", async () => {
    const { pool, db, eventType, host1 } = await setup();

    try {
      const created = await createHold(eventType.id, [host1.id], slot, ttl, db);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const confirmed = await confirmHold(
        created.value.map((h) => h.id),
        invitee,
        db,
      );
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;
      expect(confirmed.value.hostUserIds).toEqual([host1.id]);

      const [booking] = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, confirmed.value.bookingId));
      expect(booking?.status).toBe("confirmed");

      const [holdRow] = await db.select().from(schema.holds).where(eq(schema.holds.hostUserId, host1.id));
      expect(holdRow?.status).toBe("confirmed");

      const secondConfirm = await confirmHold(
        created.value.map((h) => h.id),
        invitee,
        db,
      );
      expect(secondConfirm).toEqual({ ok: false, error: { kind: "not_active" } });
    } finally {
      await pool.end();
    }
  });

  test("group hold rollback when one host is contended", async () => {
    const { pool, db, eventType, host1, host2 } = await setup();

    try {
      const contended = await createHold(eventType.id, [host2.id], slot, ttl, db);
      expect(contended.ok).toBe(true);

      const group = await createHold(eventType.id, [host1.id, host2.id], slot, ttl, db);
      expect(group).toEqual({ ok: false, error: { kind: "slot_taken" } });

      const host1Rows = await db.select().from(schema.holds).where(eq(schema.holds.hostUserId, host1.id));
      expect(host1Rows).toHaveLength(0);

      const host2Rows = await db.select().from(schema.holds).where(eq(schema.holds.hostUserId, host2.id));
      expect(host2Rows).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });

  test("rescheduling onto an OOO forward target reassigns the booking", async () => {
    const { pool, db, eventType, host1, host2 } = await setup();
    try {
      const original = await createHold(eventType.id, [host1.id], slot, ttl, db);
      expect(original.ok).toBe(true);
      if (!original.ok) return;
      const confirmed = await confirmHold(
        original.value.map((hold) => hold.id),
        invitee,
        db,
      );
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;

      const movedSlot = {
        start: slot.start.add({ hours: 24 }),
        end: slot.end.add({ hours: 24 }),
      };
      const forwarded = await createHold(eventType.id, [host2.id], movedSlot, ttl, db);
      expect(forwarded.ok).toBe(true);
      if (!forwarded.ok) return;
      const moved = await confirmReschedule(
        confirmed.value.bookingId,
        forwarded.value.map((hold) => hold.id),
        db,
      );
      expect(moved.ok).toBe(true);
      if (!moved.ok) return;
      expect(moved.value.hostUserIds).toEqual([host2.id]);

      const events = await db
        .select({ kind: schema.bookingEvents.kind })
        .from(schema.bookingEvents)
        .where(eq(schema.bookingEvents.bookingId, confirmed.value.bookingId));
      expect(events.map((event) => event.kind)).toEqual([
        "created",
        "rescheduled",
        "reassigned",
      ]);
    } finally {
      await pool.end();
    }
  });
});

import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("analytics views", () => {
  test("report outcomes, no-shows, lead time, and round-robin distribution", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table
          ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypeHosts},
          ${schema.eventTypes}, ${schema.users}
        restart identity cascade
      `);

      const hosts = await db.insert(schema.users).values([
        { name: "Host One", email: "host1@example.com" },
        { name: "Host Two", email: "host2@example.com" },
      ]).returning();
      const [host1, host2] = hosts;
      if (!host1 || !host2) throw new Error("failed to create host fixtures");

      const eventTypes = await db.insert(schema.eventTypes).values([
        { slug: "round-robin", title: "Round robin", durationMinutes: 30, mode: "round_robin" },
        { slug: "solo", title: "Solo", durationMinutes: 30, mode: "solo" },
      ]).returning();
      const [roundRobin, solo] = eventTypes;
      if (!roundRobin || !solo) throw new Error("failed to create event type fixtures");

      await db.insert(schema.eventTypeHosts).values([
        { eventTypeId: roundRobin.id, userId: host1.id, weight: 25 },
        { eventTypeId: roundRobin.id, userId: host2.id, weight: 75 },
        { eventTypeId: solo.id, userId: host1.id, role: "required" },
      ]);

      const bookings = await db.insert(schema.bookings).values([
        {
          eventTypeId: roundRobin.id,
          startsAt: new Date("2025-01-10T12:00:00Z"),
          endsAt: new Date("2025-01-10T12:30:00Z"),
          inviteeEmail: "confirmed@example.com",
          inviteeName: "Confirmed",
          inviteeTimezone: "UTC",
          hostUserIds: [host1.id],
          status: "confirmed",
          rescheduleToken: "r-confirmed",
          cancelToken: "c-confirmed",
        },
        {
          eventTypeId: roundRobin.id,
          startsAt: new Date("2025-01-20T12:00:00Z"),
          endsAt: new Date("2025-01-20T12:30:00Z"),
          inviteeEmail: "noshow@example.com",
          inviteeName: "No Show",
          inviteeTimezone: "UTC",
          hostUserIds: [host2.id],
          status: "confirmed",
          rescheduleToken: "r-noshow",
          cancelToken: "c-noshow",
        },
        {
          eventTypeId: solo.id,
          startsAt: new Date("2025-02-10T12:00:00Z"),
          endsAt: new Date("2025-02-10T12:30:00Z"),
          inviteeEmail: "cancelled@example.com",
          inviteeName: "Cancelled",
          inviteeTimezone: "UTC",
          hostUserIds: [host1.id],
          // Deliberately stale: analytics must read the cancelled event.
          status: "confirmed",
          rescheduleToken: "r-cancelled",
          cancelToken: "c-cancelled",
        },
      ]).returning();
      const [confirmed, noShow, cancelled] = bookings;
      if (!confirmed || !noShow || !cancelled) throw new Error("failed to create booking fixtures");

      await db.insert(schema.bookingEvents).values([
        {
          bookingId: confirmed.id,
          kind: "created",
          payload: {},
          createdAt: new Date("2025-01-01T12:00:00Z"),
        },
        {
          bookingId: noShow.id,
          kind: "created",
          payload: {},
          createdAt: new Date("2025-01-05T12:00:00Z"),
        },
        {
          bookingId: noShow.id,
          kind: "no_show",
          payload: {},
          createdAt: new Date("2025-01-20T12:31:00Z"),
        },
        {
          bookingId: cancelled.id,
          kind: "created",
          payload: {},
          createdAt: new Date("2025-02-01T12:00:00Z"),
        },
        {
          bookingId: cancelled.id,
          kind: "cancelled",
          payload: {},
          createdAt: new Date("2025-02-02T12:00:00Z"),
        },
      ]);

      const outcomes = await pool.query<{
        event_type_slug: string;
        calendar_month_utc: Date;
        final_status: string;
        booking_count: string;
      }>(`
        select event_type_slug, calendar_month_utc, final_status, booking_count
        from analytics_booking_outcomes
        order by event_type_slug, final_status
      `);
      expect(outcomes.rows.map((row) => ({
        slug: row.event_type_slug,
        month: row.calendar_month_utc.toISOString().slice(0, 7),
        status: row.final_status,
        count: Number(row.booking_count),
      }))).toEqual([
        { slug: "round-robin", month: "2025-01", status: "confirmed", count: 1 },
        { slug: "round-robin", month: "2025-01", status: "no_show", count: 1 },
        { slug: "solo", month: "2025-02", status: "cancelled", count: 1 },
      ]);

      const noShows = await pool.query<{
        event_type_slug: string;
        completed_count: string;
        no_show_count: string;
        no_show_rate: string;
      }>("select * from analytics_no_show_rate order by event_type_slug");
      expect(noShows.rows).toHaveLength(1);
      expect(noShows.rows[0]?.event_type_slug).toBe("round-robin");
      expect(Number(noShows.rows[0]?.completed_count)).toBe(2);
      expect(Number(noShows.rows[0]?.no_show_count)).toBe(1);
      expect(Number(noShows.rows[0]?.no_show_rate)).toBe(0.5);

      const leadTimes = await pool.query<{
        booking_id: string;
        lead_seconds: string;
      }>(`
        select booking_id, extract(epoch from lead_time)::text as lead_seconds
        from analytics_lead_time
        order by booking_id
      `);
      expect(leadTimes.rows).toHaveLength(3);
      expect(Number(leadTimes.rows.find((row) => row.booking_id === confirmed.id)?.lead_seconds))
        .toBe(9 * 24 * 60 * 60);

      const distribution = await pool.query<{
        host_email: string;
        weight: number;
        booking_count: string;
        booking_share: string;
        weight_share: string;
      }>(`
        select host_email, weight, booking_count, booking_share, weight_share
        from analytics_rr_distribution
        order by host_email
      `);
      expect(distribution.rows.map((row) => ({
        email: row.host_email,
        weight: row.weight,
        bookings: Number(row.booking_count),
        bookingShare: Number(row.booking_share),
        weightShare: Number(row.weight_share),
      }))).toEqual([
        {
          email: "host1@example.com",
          weight: 25,
          bookings: 1,
          bookingShare: 0.5,
          weightShare: 0.25,
        },
        {
          email: "host2@example.com",
          weight: 75,
          bookings: 1,
          bookingShare: 0.5,
          weightShare: 0.75,
        },
      ]);
    } finally {
      await pool.end();
    }
  });
});

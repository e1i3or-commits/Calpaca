import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as schema from "../../src/db/schema";
import { listBookingsNeedingReminder } from "../../src/db/booking-repo";

/**
 * Integration coverage for the reminder sweep query (same convention as
 * tests/db/availability-repo.test.ts). The semantics under test: remind once
 * per time slot — a booking made or moved inside the lead window gets no
 * reminder (its confirmation email just went out), and a reschedule after a
 * sent reminder re-arms it.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("listBookingsNeedingReminder", () => {
  const lead = Temporal.Duration.from({ hours: 24 });

  async function setup() {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });

    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(
      sql`truncate table ${schema.calendarBusyCache}, ${schema.calendarConnections}, ${schema.holds}, ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes}, ${schema.users} restart identity cascade`,
    );

    const [eventTypeRow] = await db
      .insert(schema.eventTypes)
      .values({ slug: "test-event", title: "Test event", durationMinutes: 30 })
      .returning();
    if (!eventTypeRow) throw new Error("failed to insert event type fixture");
    const eventType = eventTypeRow;

    const now = Temporal.Now.instant();

    /** Inserts a booking plus its event history; hours are offsets from now
     * (negative = past). Every event's created_at is explicit so the query's
     * time arithmetic is under test, not defaultNow(). */
    async function insertBooking(opts: {
      startsInHours: number;
      status?: string;
      events: { kind: "created" | "rescheduled" | "reminder_sent"; atHours: number }[];
    }): Promise<string> {
      const startsAt = now.add({ hours: opts.startsInHours });
      const key = `${opts.startsInHours}-${opts.status ?? "confirmed"}-${opts.events.map((e) => `${e.kind}@${e.atHours}`).join(",")}`;
      const [booking] = await db
        .insert(schema.bookings)
        .values({
          eventTypeId: eventType.id,
          startsAt: new Date(startsAt.epochMilliseconds),
          endsAt: new Date(startsAt.add({ minutes: 30 }).epochMilliseconds),
          inviteeEmail: "invitee@example.com",
          inviteeName: "Invitee",
          inviteeTimezone: "UTC",
          hostUserIds: [],
          status: opts.status ?? "confirmed",
          rescheduleToken: `r-${key}`,
          cancelToken: `c-${key}`,
        })
        .returning();
      if (!booking) throw new Error("failed to insert booking fixture");

      for (const event of opts.events) {
        await db.insert(schema.bookingEvents).values({
          bookingId: booking.id,
          kind: event.kind,
          payload: {},
          createdAt: new Date(now.add({ hours: event.atHours }).epochMilliseconds),
        });
      }
      return booking.id;
    }

    return { pool, db, now, insertBooking };
  }

  test("due: confirmed, inside the window, booked before the reminder point", async () => {
    const { pool, db, now, insertBooking } = await setup();
    try {
      const due = await insertBooking({
        startsInHours: 12,
        events: [{ kind: "created", atHours: -72 }],
      });
      // outside the window entirely
      await insertBooking({ startsInHours: 48, events: [{ kind: "created", atHours: -72 }] });
      // already started
      await insertBooking({ startsInHours: -1, events: [{ kind: "created", atHours: -72 }] });
      // cancelled
      await insertBooking({
        startsInHours: 12,
        status: "cancelled",
        events: [{ kind: "created", atHours: -72 }],
      });

      expect(await listBookingsNeedingReminder(now, lead, db)).toEqual([due]);
    } finally {
      await pool.end();
    }
  });

  test("a booking made inside the window is skipped — no nudge right after the confirmation", async () => {
    const { pool, db, now, insertBooking } = await setup();
    try {
      await insertBooking({ startsInHours: 12, events: [{ kind: "created", atHours: -2 }] });
      expect(await listBookingsNeedingReminder(now, lead, db)).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test("a sent reminder is not repeated", async () => {
    const { pool, db, now, insertBooking } = await setup();
    try {
      await insertBooking({
        startsInHours: 12,
        events: [
          { kind: "created", atHours: -72 },
          { kind: "reminder_sent", atHours: -1 },
        ],
      });
      expect(await listBookingsNeedingReminder(now, lead, db)).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test("a reschedule after a sent reminder re-arms it; one inside the window does not", async () => {
    const { pool, db, now, insertBooking } = await setup();
    try {
      const rearmed = await insertBooking({
        startsInHours: 12,
        events: [
          { kind: "created", atHours: -240 },
          { kind: "reminder_sent", atHours: -120 },
          { kind: "rescheduled", atHours: -84 },
        ],
      });
      // moved to tomorrow just now: the reschedule confirmation is enough
      await insertBooking({
        startsInHours: 12,
        events: [
          { kind: "created", atHours: -240 },
          { kind: "reminder_sent", atHours: -120 },
          { kind: "rescheduled", atHours: -2 },
        ],
      });

      expect(await listBookingsNeedingReminder(now, lead, db)).toEqual([rearmed]);
    } finally {
      await pool.end();
    }
  });
});

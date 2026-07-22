import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as schema from "../../src/db/schema";
import { appendEvent, getBookingById, rebuildProjection } from "../../src/db/booking-repo";
import { recordInviteeRejection } from "../../src/jobs/invite-email";

/**
 * Integration coverage for the invite_status projection column (migration
 * 0007) — the invite lifecycle folded off the event log into `bookings`, plus
 * the SMTP rejected-recipient classification that feeds it. Same convention
 * as tests/db/reminder-query.test.ts.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("invite_status projection", () => {
  const INVITEE = "Invitee@Example.com";

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

    const startsAt = Temporal.Now.instant().add({ hours: 48 });

    async function insertBooking(): Promise<string> {
      const [booking] = await db
        .insert(schema.bookings)
        .values({
          eventTypeId: eventType.id,
          startsAt: new Date(startsAt.epochMilliseconds),
          endsAt: new Date(startsAt.add({ minutes: 30 }).epochMilliseconds),
          inviteeEmail: INVITEE,
          inviteeName: "Invitee",
          inviteeTimezone: "UTC",
          hostUserIds: [],
          rescheduleToken: "r-token",
          cancelToken: "c-token",
        })
        .returning();
      if (!booking) throw new Error("failed to insert booking fixture");

      const created = await appendEvent(
        booking.id,
        "created",
        { startsAt, endsAt: startsAt.add({ minutes: 30 }), hostUserIds: [] },
        db,
      );
      if (!created.ok) throw new Error("fixture: created event rejected");
      return booking.id;
    }

    async function inviteStatusOf(bookingId: string): Promise<string | undefined> {
      const [row] = await db
        .select({ inviteStatus: schema.bookings.inviteStatus })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, bookingId));
      return row?.inviteStatus;
    }

    return { pool, db, insertBooking, inviteStatusOf };
  }

  test("the invite lifecycle folds into the column: none → sent → delivered", async () => {
    const { pool, db, insertBooking, inviteStatusOf } = await setup();
    try {
      const id = await insertBooking();
      expect(await inviteStatusOf(id)).toBe("none");

      expect((await appendEvent(id, "invite_sent", {}, db)).ok).toBe(true);
      expect(await inviteStatusOf(id)).toBe("sent");

      expect((await appendEvent(id, "invite_delivered", {}, db)).ok).toBe(true);
      expect(await inviteStatusOf(id)).toBe("delivered");

      const row = await getBookingById(id, db);
      expect(row?.inviteStatus).toBe("delivered");
    } finally {
      await pool.end();
    }
  });

  test("a bounce after send projects failed", async () => {
    const { pool, db, insertBooking, inviteStatusOf } = await setup();
    try {
      const id = await insertBooking();
      await appendEvent(id, "invite_sent", {}, db);

      expect((await appendEvent(id, "invite_failed", { reason: "bounced" }, db)).ok).toBe(true);
      expect(await inviteStatusOf(id)).toBe("failed");
    } finally {
      await pool.end();
    }
  });

  test("rejected-recipient classification: only the invitee's address flips the status", async () => {
    const { pool, db, insertBooking, inviteStatusOf } = await setup();
    try {
      const id = await insertBooking();
      await appendEvent(id, "invite_sent", {}, db);

      // nothing rejected, then a host cc rejected: both leave the invite alone
      await recordInviteeRejection(id, INVITEE, [], db);
      expect(await inviteStatusOf(id)).toBe("sent");
      await recordInviteeRejection(id, INVITEE, ["host@example.com"], db);
      expect(await inviteStatusOf(id)).toBe("sent");

      // the invitee rejected — matched case-insensitively — records the failure
      await recordInviteeRejection(id, INVITEE, ["invitee@example.COM"], db);
      expect(await inviteStatusOf(id)).toBe("failed");
    } finally {
      await pool.end();
    }
  });

  test("rebuildProjection repairs a drifted invite_status", async () => {
    const { pool, db, insertBooking, inviteStatusOf } = await setup();
    try {
      const id = await insertBooking();
      await appendEvent(id, "invite_sent", {}, db);

      await db
        .update(schema.bookings)
        .set({ inviteStatus: "none" })
        .where(eq(schema.bookings.id, id));
      expect(await inviteStatusOf(id)).toBe("none");

      const rebuilt = await rebuildProjection(id, db);
      expect(rebuilt.ok).toBe(true);
      expect(await inviteStatusOf(id)).toBe("sent");
    } finally {
      await pool.end();
    }
  });
});

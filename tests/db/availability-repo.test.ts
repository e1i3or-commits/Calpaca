import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as schema from "../../src/db/schema";
import {
  getAvailabilityEvidenceForUsers,
  getBusyForUsers,
  getCapacityAwareBusyForUsers,
} from "../../src/db/availability-repo";

/**
 * Integration coverage for the busy-interval source against a real Postgres
 * instance (same convention as tests/db/holds-repo.test.ts). The regression
 * that motivates this file: a confirmed booking's slot was offered — and
 * hold-time re-verified as free — for a second booking, because busy came
 * from the calendar cache alone. Confirmed bookings must be busy.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("availability-repo getBusyForUsers", () => {
  async function setup() {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });

    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(
      sql`truncate table ${schema.calendarBusyCache}, ${schema.calendarConnections}, ${schema.holds}, ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes}, ${schema.users} restart identity cascade`,
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
      ])
      .returning();
    const [host1, host2] = hostRows;
    if (!host1 || !host2) throw new Error("failed to insert host fixtures");

    return { pool, db, eventType, host1, host2 };
  }

  const window = {
    start: Temporal.Instant.from("2027-05-01T00:00Z"),
    end: Temporal.Instant.from("2027-05-02T00:00Z"),
  };

  function bookingValues(
    eventTypeId: string,
    hostUserIds: string[],
    start: string,
    end: string,
    status = "confirmed",
  ) {
    return {
      eventTypeId,
      startsAt: new Date(start),
      endsAt: new Date(end),
      inviteeEmail: "invitee@example.com",
      inviteeName: "Invitee",
      inviteeTimezone: "UTC",
      hostUserIds,
      status,
      rescheduleToken: `r-${start}-${hostUserIds.join(",")}-${status}`,
      cancelToken: `c-${start}-${hostUserIds.join(",")}-${status}`,
    };
  }

  test("confirmed bookings surface as busy for every host on the meeting", async () => {
    const { pool, db, eventType, host1, host2 } = await setup();

    try {
      await db.insert(schema.bookings).values([
        // group booking: both hosts are busy for it
        bookingValues(eventType.id, [host1.id, host2.id], "2027-05-01T10:00Z", "2027-05-01T10:30Z"),
        // host2 only
        bookingValues(eventType.id, [host2.id], "2027-05-01T14:00Z", "2027-05-01T14:30Z"),
      ]);

      const busy = await getBusyForUsers([host1.id, host2.id], window, db);
      const byUser = new Map(busy.map((b) => [b.userId, b.intervals]));

      expect(byUser.get(host1.id)).toHaveLength(1);
      expect(byUser.get(host2.id)).toHaveLength(2);
      expect(byUser.get(host1.id)?.[0]?.start.toString()).toBe("2027-05-01T10:00:00Z");
      expect(byUser.get(host1.id)?.[0]?.end.toString()).toBe("2027-05-01T10:30:00Z");
    } finally {
      await pool.end();
    }
  });

  test("capacity bookings block their slot only after the final seat is taken", async () => {
    const { pool, db, eventType, host1 } = await setup();
    try {
      await db.update(schema.eventTypes).set({ capacity: 2 })
        .where(sql`${schema.eventTypes.id} = ${eventType.id}`);
      await db.insert(schema.bookings).values(
        bookingValues(
          eventType.id,
          [host1.id],
          "2027-05-01T10:00Z",
          "2027-05-01T10:30Z",
        ),
      );
      expect(await getCapacityAwareBusyForUsers(
        [host1.id],
        window,
        eventType.id,
        2,
        db,
      )).toHaveLength(0);
      await db.insert(schema.bookings).values({
        ...bookingValues(
          eventType.id,
          [host1.id],
          "2027-05-01T10:00Z",
          "2027-05-01T10:30Z",
        ),
        inviteeEmail: "second@example.com",
        rescheduleToken: "second-reschedule",
        cancelToken: "second-cancel",
      });
      const busy = await getCapacityAwareBusyForUsers(
        [host1.id],
        window,
        eventType.id,
        2,
        db,
      );
      expect(busy[0]?.intervals).toHaveLength(2);
    } finally {
      await pool.end();
    }
  });

  test("cancelled bookings and bookings outside the window do not block", async () => {
    const { pool, db, eventType, host1 } = await setup();

    try {
      await db.insert(schema.bookings).values([
        bookingValues(eventType.id, [host1.id], "2027-05-01T10:00Z", "2027-05-01T10:30Z", "cancelled"),
        // entirely before the window
        bookingValues(eventType.id, [host1.id], "2027-04-30T10:00Z", "2027-04-30T10:30Z"),
        // entirely after the window
        bookingValues(eventType.id, [host1.id], "2027-05-03T10:00Z", "2027-05-03T10:30Z"),
      ]);

      const busy = await getBusyForUsers([host1.id], window, db);
      expect(busy).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });

  test("booking busy merges with calendar-cache busy for the same host", async () => {
    const { pool, db, eventType, host1 } = await setup();

    try {
      const [connection] = await db
        .insert(schema.calendarConnections)
        .values({
          userId: host1.id,
          provider: "google",
          externalCalendarId: "primary",
        })
        .returning();
      if (!connection) throw new Error("failed to insert connection fixture");

      await db.insert(schema.calendarBusyCache).values({
        connectionId: connection.id,
        externalEventId: "evt-1",
        startsAt: new Date("2027-05-01T09:00Z"),
        endsAt: new Date("2027-05-01T09:30Z"),
      });
      await db
        .insert(schema.bookings)
        .values([
          bookingValues(eventType.id, [host1.id], "2027-05-01T10:00Z", "2027-05-01T10:30Z"),
        ]);

      const busy = await getBusyForUsers([host1.id], window, db);
      expect(busy).toHaveLength(1);
      const starts = busy[0]?.intervals.map((i) => i.start.toString()).sort();
      expect(starts).toEqual(["2027-05-01T09:00:00Z", "2027-05-01T10:00:00Z"]);
    } finally {
      await pool.end();
    }
  });

  test("calendar connections excluded from conflict checking do not block", async () => {
    const { pool, db, host1 } = await setup();
    try {
      const [enabled, ignored] = await db
        .insert(schema.calendarConnections)
        .values([
          {
            userId: host1.id,
            externalCalendarId: "primary",
            conflictEnabled: true,
          },
          {
            userId: host1.id,
            externalCalendarId: "holidays",
            conflictEnabled: false,
          },
        ])
        .returning();
      await db.insert(schema.calendarBusyCache).values([
        {
          connectionId: enabled!.id,
          externalEventId: "work",
          startsAt: new Date("2027-05-01T09:00Z"),
          endsAt: new Date("2027-05-01T09:30Z"),
        },
        {
          connectionId: ignored!.id,
          externalEventId: "holiday",
          startsAt: new Date("2027-05-01T10:00Z"),
          endsAt: new Date("2027-05-01T10:30Z"),
        },
      ]);

      const busy = await getBusyForUsers([host1.id], window, db);
      expect(busy[0]?.intervals.map((interval) => interval.start.toString())).toEqual([
        "2027-05-01T09:00:00Z",
      ]);
    } finally {
      await pool.end();
    }
  });

  test("summarizes only conflict-enabled calendar evidence for each host", async () => {
    const { pool, db, host1, host2 } = await setup();
    try {
      await db.insert(schema.calendarConnections).values([
        {
          userId: host1.id,
          externalCalendarId: "primary",
          conflictEnabled: true,
          syncHealthy: true,
          lastSyncedAt: new Date("2027-05-01T08:30:00Z"),
        },
        {
          userId: host1.id,
          externalCalendarId: "team",
          conflictEnabled: true,
          syncHealthy: true,
          lastSyncedAt: new Date("2027-05-01T08:00:00Z"),
        },
        {
          userId: host2.id,
          externalCalendarId: "ignored",
          conflictEnabled: false,
          syncHealthy: true,
          lastSyncedAt: new Date("2027-05-01T09:00:00Z"),
        },
      ]);

      const evidence = await getAvailabilityEvidenceForUsers(
        [host1.id, host2.id],
        db,
      );

      expect(evidence).toEqual([
        {
          userId: host1.id,
          connected: true,
          healthy: true,
          lastSyncedAt: new Date("2027-05-01T08:00:00Z"),
        },
        {
          userId: host2.id,
          connected: false,
          healthy: false,
          lastSyncedAt: null,
        },
      ]);
    } finally {
      await pool.end();
    }
  });
});

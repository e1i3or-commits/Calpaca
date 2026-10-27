import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as schema from "../../src/db/schema";
import { createEventType, updateEventType } from "../../src/db/admin-repo";
import { createHold, confirmHold } from "../../src/db/holds-repo";

describe.skipIf(!process.env.TEST_DATABASE_URL)("booking window persistence and final confirmation", () => {
  test("saves per-link limits, preserves them for older clients, and rechecks a held slot", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      const key = crypto.randomUUID();
      const [workspace] = await db.insert(schema.workspaces).values({ name: "Booking windows test", slug: `test-${key}` }).returning();
      const [host] = await db.insert(schema.users).values({ name: "Test host", email: `${key}@example.test` }).returning();
      if (!workspace || !host) throw new Error("Missing test fixture");
      const window = { timezone: "UTC", startDate: "2027-05-01", endDate: "2027-05-31", weeklyWindows: null, excludedDates: [] };
      const input = { title: "Screening", slug: `screen-${key}`, durationMinutes: 30, mode: "solo" as const, bufferBeforeMin: 0, bufferAfterMin: 0, minimumNoticeMin: 0, rollingWindowDays: 90, scheduleId: null, teamId: null, hosts: [{ userId: host.id, role: "member" as const, weight: 100 }] };
      const link = await createEventType(host.id, { ...input, bookingWindow: window }, db, workspace.id);
      if (typeof link === "string") throw new Error(link);
      expect(link.bookingWindow).toEqual(window);
      const saved = await updateEventType(link.id, host.id, input, db, workspace.id);
      expect(typeof saved === "object" && saved?.bookingWindow).toEqual(window);
      const slot = { start: Temporal.Instant.from("2027-05-03T10:00Z"), end: Temporal.Instant.from("2027-05-03T10:30Z") };
      const held = await createHold(link.id, [host.id], slot, Temporal.Duration.from({ minutes: 10 }), db);
      if (!held.ok) throw new Error(JSON.stringify(held.error));
      await db.update(schema.eventTypes).set({ bookingWindow: { ...window, excludedDates: ["2027-05-03"] } }).where(eq(schema.eventTypes.id, link.id));
      const invitee = { email: "candidate@example.test", name: "Candidate", timezone: "UTC" };
      const blocked = await confirmHold(held.value.map((h) => h.id), invitee, db);
      expect(blocked).toEqual({ ok: false, error: { kind: "not_active" } });
      expect(await db.select().from(schema.bookings).where(eq(schema.bookings.eventTypeId, link.id))).toHaveLength(0);
      await db.update(schema.eventTypes).set({ bookingWindow: null }).where(eq(schema.eventTypes.id, link.id));
      const accepted = await confirmHold(held.value.map((h) => h.id), invitee, db);
      expect(accepted.ok).toBe(true);
    } finally { await pool.end(); }
  });
});

import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import { effectiveOpenIntervals, type HostSchedule } from "@calpaca/core";
import * as schema from "../../src/db/schema";
import { getSchedulesForUsers } from "../../src/db/availability-repo";
import {
  addWorkspaceClosedRange,
  deleteWorkspaceClosedRange,
  getWorkspaceClosedDays,
  setWorkspaceUsHolidays,
} from "../../src/db/closed-days-repo";

/**
 * Workspace closed days reach every host through the schedule loader, so
 * booking pages, holds and the troubleshooter all see them without each
 * caller remembering to add them.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("closed days", () => {
  async function setup() {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`truncate table ${schema.workspaceClosedDays}, ${schema.workspaceMembers}, ${schema.schedules}, ${schema.workspaces}, ${schema.users} restart identity cascade`);
    const [workspace] = await db.insert(schema.workspaces).values({ name: "TourScale", slug: "tourscale-closed-days" }).returning();
    const [host] = await db.insert(schema.users).values({ email: "host@example.com", name: "Host" }).returning();
    if (!workspace || !host) throw new Error("fixtures");
    await db.insert(schema.workspaceMembers).values({ workspaceId: workspace.id, userId: host.id });
    await db.insert(schema.schedules).values({
      userId: host.id,
      timezone: "America/New_York",
      rules: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" })),
    });
    return { pool, db, workspace, host };
  }

  const openDays = (schedule: HostSchedule, from: string, to: string) =>
    effectiveOpenIntervals(schedule.rules, schedule.overrides ?? [], schedule.timezone, {
      start: Temporal.Instant.from(`${from}T12:00:00Z`),
      end: Temporal.Instant.from(`${to}T12:00:00Z`),
    }).map((interval) => interval.start.toZonedDateTimeISO(schedule.timezone).toPlainDate().toString());

  test("a new workspace observes the default holidays and closes them for its hosts", async () => {
    const { pool, db, workspace, host } = await setup();
    try {
      const config = await getWorkspaceClosedDays(workspace.id, db);
      expect(config.usHolidays).toContain("thanksgiving");
      expect(config.usHolidays).not.toContain("columbus_day");
      const [schedule] = await getSchedulesForUsers([host.id], db);
      expect(openDays(schedule!, "2026-11-23", "2026-11-28")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    } finally {
      await pool.end();
    }
  });

  test("a company range closes its days, and removing it reopens them", async () => {
    const { pool, db, workspace, host } = await setup();
    try {
      const range = await addWorkspaceClosedRange(workspace.id, { name: "TourScale Conference", startDate: "2027-02-01", endDate: "2027-02-04" }, db);
      let [schedule] = await getSchedulesForUsers([host.id], db);
      expect(openDays(schedule!, "2027-02-01", "2027-02-06")).toEqual(["2027-02-05"]);
      expect(await deleteWorkspaceClosedRange(workspace.id, range.id, db)).toBe(true);
      [schedule] = await getSchedulesForUsers([host.id], db);
      expect(openDays(schedule!, "2027-02-01", "2027-02-06")).toEqual(["2027-02-01", "2027-02-02", "2027-02-03", "2027-02-04", "2027-02-05"]);
    } finally {
      await pool.end();
    }
  });

  test("turning a holiday off opens it again", async () => {
    const { pool, db, workspace, host } = await setup();
    try {
      await setWorkspaceUsHolidays(workspace.id, ["christmas_day"], db);
      const [schedule] = await getSchedulesForUsers([host.id], db);
      expect(openDays(schedule!, "2026-11-23", "2026-11-28")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
      expect(openDays(schedule!, "2026-12-24", "2026-12-26")).toEqual(["2026-12-24"]);
    } finally {
      await pool.end();
    }
  });

  test("a host outside any workspace keeps only their own schedule", async () => {
    const { pool, db, host } = await setup();
    try {
      await db.delete(schema.workspaceMembers);
      const [schedule] = await getSchedulesForUsers([host.id], db);
      expect(schedule!.overrides).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});

import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  getWritableConnectionForUser,
  updateConnectionPreferences,
} from "../../src/db/sync-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("calendar preferences", () => {
  test("keeps exactly one explicit write destination per user", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.calendarConnections}, ${schema.users}
        restart identity cascade
      `);
      const [user] = await db.insert(schema.users).values({
        name: "Host",
        email: "host@example.test",
      }).returning();
      const [primary, team] = await db.insert(schema.calendarConnections).values([
        { userId: user!.id, externalCalendarId: "primary" },
        { userId: user!.id, externalCalendarId: "team" },
      ]).returning();

      expect((await getWritableConnectionForUser(user!.id, db))?.id).toBe(primary!.id);
      await updateConnectionPreferences(team!.id, user!.id, {
        conflictEnabled: false,
        isWriteDestination: true,
      }, db);
      expect((await getWritableConnectionForUser(user!.id, db))?.id).toBe(team!.id);

      await updateConnectionPreferences(primary!.id, user!.id, {
        isWriteDestination: true,
      }, db);
      const rows = await db.select().from(schema.calendarConnections);
      expect(rows.filter((row) => row.isWriteDestination).map((row) => row.id)).toEqual([
        primary!.id,
      ]);
      expect(rows.find((row) => row.id === team!.id)?.conflictEnabled).toBe(false);
    } finally {
      await pool.end();
    }
  });
});

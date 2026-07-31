import { describe, expect, test } from "bun:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";

type TestDb = NodePgDatabase<typeof schema>;

/** Fresh pool, migrated schema, empty tables. Always closes the pool. */
export async function withDb(run: (db: TestDb) => Promise<void>): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`
      truncate table ${schema.eventTypeFolders}, ${schema.eventTypes},
        ${schema.workspaces}, ${schema.users}
      restart identity cascade
    `);
    await run(db);
  } finally {
    await pool.end();
  }
}

const acmeWorkspace = { name: "Acme", slug: "acme" };
const otherWorkspace = { name: "Other", slug: "other" };
const ownerUser = { name: "Owner", email: "owner@example.test" };

describe.skipIf(!process.env.TEST_DATABASE_URL)("event type folders schema", () => {
  test("deleting a folder un-groups its event types instead of deleting them", async () => {
    await withDb(async (db) => {
      const [workspace] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const [owner] = await db.insert(schema.users).values(ownerUser).returning();
      const [folder] = await db.insert(schema.eventTypeFolders)
        .values({ workspaceId: workspace!.id, name: "Franchise", position: 0 }).returning();
      const [eventType] = await db.insert(schema.eventTypes).values({
        workspaceId: workspace!.id,
        ownerUserId: owner!.id,
        folderId: folder!.id,
        slug: "kickoff",
        title: "Kickoff",
        durationMinutes: 45,
      }).returning();

      await db.delete(schema.eventTypeFolders).where(eq(schema.eventTypeFolders.id, folder!.id));

      const [survivor] = await db.select().from(schema.eventTypes)
        .where(eq(schema.eventTypes.id, eventType!.id));
      expect(survivor).toBeDefined();
      expect(survivor!.folderId).toBeNull();
    });
  });

  test("folder names collide case-insensitively within a workspace but not across them", async () => {
    await withDb(async (db) => {
      const [acme] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const [other] = await db.insert(schema.workspaces).values(otherWorkspace).returning();

      await db.insert(schema.eventTypeFolders)
        .values({ workspaceId: acme!.id, name: "Franchise", position: 0 });

      await expect(
        db.insert(schema.eventTypeFolders)
          .values({ workspaceId: acme!.id, name: "franchise", position: 1 }),
      ).rejects.toThrow();

      const [elsewhere] = await db.insert(schema.eventTypeFolders)
        .values({ workspaceId: other!.id, name: "Franchise", position: 0 }).returning();
      expect(elsewhere).toBeDefined();
    });
  });
});

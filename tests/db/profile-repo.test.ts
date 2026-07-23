import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import {
  authenticateApiToken,
  createApiToken,
  revokeApiToken,
} from "../../src/db/profile-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("profile and API tokens", () => {
  test("stores only a hash, authenticates, records use, and revokes", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.apiTokens}, ${schema.users}
        restart identity cascade
      `);
      const [user] = await db.insert(schema.users).values({
        name: "Kai",
        email: "kai@example.test",
      }).returning();
      const created = await createApiToken(user!.id, "automation", null, db);
      const [stored] = await db
        .select()
        .from(schema.apiTokens)
        .where(eq(schema.apiTokens.id, created.record.id));

      expect(stored?.tokenHash).not.toBe(created.token);
      expect(stored?.tokenHash).toHaveLength(64);
      expect((await authenticateApiToken(created.token, new Date(), db))?.id).toBe(user!.id);

      const [used] = await db
        .select({ lastUsedAt: schema.apiTokens.lastUsedAt })
        .from(schema.apiTokens)
        .where(eq(schema.apiTokens.id, created.record.id));
      expect(used?.lastUsedAt).not.toBeNull();

      expect(await revokeApiToken(user!.id, created.record.id, db)).toBe(true);
      expect(await authenticateApiToken(created.token, new Date(), db)).toBeNull();
    } finally {
      await pool.end();
    }
  });
});

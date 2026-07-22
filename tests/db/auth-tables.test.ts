import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";

/**
 * Integration coverage for the BetterAuth-managed tables (same convention as
 * tests/db/holds-repo.test.ts): SKIPs cleanly without TEST_DATABASE_URL, runs
 * migrations programmatically, truncates before each test. Exercises the
 * shapes BetterAuth's Drizzle adapter relies on: uuid ids, unique session
 * token, cascade delete from users, and the OAuth token columns on accounts.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("auth-tables", () => {
  async function setup() {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(
      sql`truncate table ${schema.sessions}, ${schema.accounts}, ${schema.verifications}, ${schema.calendarConnections}, ${schema.users} restart identity cascade`,
    );
    return { db, pool };
  }

  test("user -> session -> account round-trip with uuid ids", async () => {
    const { db, pool } = await setup();
    try {
      const [user] = await db
        .insert(schema.users)
        .values({ email: "host@example.com", name: "Host" })
        .returning();
      expect(user!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(user!.emailVerified).toBe(false);
      expect(user!.timezone).toBe("UTC");

      const [session] = await db
        .insert(schema.sessions)
        .values({
          userId: user!.id,
          token: "tok-1",
          expiresAt: new Date(Date.now() + 60_000),
        })
        .returning();
      expect(session!.userId).toBe(user!.id);

      const [account] = await db
        .insert(schema.accounts)
        .values({
          userId: user!.id,
          accountId: "google-sub-123",
          providerId: "google",
          accessToken: "at",
          refreshToken: "rt",
          scope: "openid email https://www.googleapis.com/auth/calendar.readonly",
        })
        .returning();
      expect(account!.refreshToken).toBe("rt");
    } finally {
      await pool.end();
    }
  });

  test("session token is unique", async () => {
    const { db, pool } = await setup();
    try {
      const [user] = await db
        .insert(schema.users)
        .values({ email: "host@example.com", name: "Host" })
        .returning();
      const values = {
        userId: user!.id,
        token: "dup-token",
        expiresAt: new Date(Date.now() + 60_000),
      };
      await db.insert(schema.sessions).values(values);
      await expect(db.insert(schema.sessions).values(values).execute()).rejects.toThrow();
    } finally {
      await pool.end();
    }
  });

  test("deleting a user cascades to sessions and accounts", async () => {
    const { db, pool } = await setup();
    try {
      const [user] = await db
        .insert(schema.users)
        .values({ email: "host@example.com", name: "Host" })
        .returning();
      await db.insert(schema.sessions).values({
        userId: user!.id,
        token: "tok-2",
        expiresAt: new Date(Date.now() + 60_000),
      });
      await db.insert(schema.accounts).values({
        userId: user!.id,
        accountId: "google-sub-456",
        providerId: "google",
      });

      await db.delete(schema.users).where(eq(schema.users.id, user!.id));

      const sessions = await db.select().from(schema.sessions);
      const accounts = await db.select().from(schema.accounts);
      expect(sessions).toHaveLength(0);
      expect(accounts).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });
});

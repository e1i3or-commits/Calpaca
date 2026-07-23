import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { listBookingPages, saveBookingPage } from "../../src/db/admin-repo";
import { getPublicBookingPage } from "../../src/db/availability-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("custom booking pages", () => {
  test("scopes selected events, preserves their order, and carries page branding", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.bookingPages}, ${schema.eventTypes},
          ${schema.workspaces}, ${schema.users}
        restart identity cascade
      `);
      const [workspace] = await db.insert(schema.workspaces)
        .values({ name: "Acme", slug: "acme" }).returning();
      const [owner] = await db.insert(schema.users)
        .values({ name: "Owner", email: "owner@example.test" }).returning();
      const [intro, demo, support] = await db.insert(schema.eventTypes).values([
        { workspaceId: workspace!.id, ownerUserId: owner!.id, slug: "intro", title: "Intro", durationMinutes: 15 },
        { workspaceId: workspace!.id, ownerUserId: owner!.id, slug: "demo", title: "Demo", durationMinutes: 30 },
        { workspaceId: workspace!.id, ownerUserId: owner!.id, slug: "support", title: "Support", durationMinutes: 60 },
      ]).returning();

      const saved = await saveBookingPage(workspace!.id, {
        slug: "sales",
        title: "Talk to sales",
        description: "Choose a conversation.",
        theme: "paper",
        logoUrl: "https://example.test/logo.svg",
        eventTypeIds: [demo!.id, intro!.id],
      }, undefined, db);
      expect(typeof saved).toBe("object");
      expect((await listBookingPages(workspace!.id, db))).toHaveLength(1);

      const page = await getPublicBookingPage(workspace!.id, "sales", db);
      expect(page?.name).toBe("Talk to sales");
      expect(page?.theme).toBe("paper");
      expect(page?.eventTypes.map((eventType) => eventType.slug)).toEqual(["demo", "intro"]);
      expect(page?.eventTypes.some((eventType) => eventType.slug === support!.slug)).toBe(false);
    } finally {
      await pool.end();
    }
  });
});

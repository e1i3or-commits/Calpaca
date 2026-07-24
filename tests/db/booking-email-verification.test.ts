import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  createBookingEmailVerification,
  validateBookingEmailReceipt,
  verifyBookingEmailCode,
} from "../../src/db/booking-email-verification-repo";

describe.skipIf(!process.env.TEST_DATABASE_URL)("booking email verification", () => {
  test("codes are single-use and receipts are scoped to event and normalized email", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`truncate table ${schema.bookingEmailVerifications}, ${schema.eventTypes}, ${schema.workspaces} restart identity cascade`);
      const [workspace] = await db.insert(schema.workspaces)
        .values({ name: "Verification", slug: "verification" }).returning();
      if (!workspace) throw new Error("workspace fixture failed");
      const [eventType] = await db.insert(schema.eventTypes).values({
        workspaceId: workspace.id,
        slug: "verified-call",
        title: "Verified call",
        durationMinutes: 30,
      }).returning();
      if (!eventType) throw new Error("event fixture failed");

      const challenge = await createBookingEmailVerification(
        eventType.id,
        " Person@Example.com ",
        db,
      );
      expect(await verifyBookingEmailCode(challenge.id, "000000", db)).toBeNull();
      const verified = await verifyBookingEmailCode(challenge.id, challenge.code, db);
      expect(verified).not.toBeNull();
      if (!verified) return;
      expect(await verifyBookingEmailCode(challenge.id, challenge.code, db)).toBeNull();
      expect(await validateBookingEmailReceipt(
        eventType.id,
        "person@example.com",
        verified.receipt,
        db,
      )).toBe(true);
      expect(await validateBookingEmailReceipt(
        eventType.id,
        "other@example.com",
        verified.receipt,
        db,
      )).toBe(false);
    } finally {
      await pool.end();
    }
  });
});

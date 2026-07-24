import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Temporal } from "@js-temporal/polyfill";
import { Pool } from "pg";
import { confirmHold, createHold } from "../../src/db/holds-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("proposal booking conversion", () => {
  test("atomically records the chosen option with the existing booking", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.proposals}, ${schema.holds},
          ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypes},
          ${schema.engagements}, ${schema.clients}, ${schema.users}
        restart identity cascade
      `);
      const [host] = await db.insert(schema.users).values({
        email: "proposal-host@example.test",
        name: "Host",
      }).returning();
      const [eventType] = await db.insert(schema.eventTypes).values({
        slug: "proposal-acceptance",
        title: "Kickoff",
        durationMinutes: 30,
      }).returning();
      const [client] = await db.insert(schema.clients).values({
        workspaceId: eventType!.workspaceId,
        name: "Acme",
        normalizedName: "acme",
        createdByUserId: host!.id,
      }).returning();
      const [engagement] = await db.insert(schema.engagements).values({
        workspaceId: eventType!.workspaceId,
        clientId: client!.id,
        name: "Website launch",
        type: "project",
        status: "active",
        visibility: "workspace",
        accountLeadUserId: host!.id,
        createdByUserId: host!.id,
      }).returning();
      const slot = {
        start: Temporal.Instant.from("2027-05-01T10:00Z"),
        end: Temporal.Instant.from("2027-05-01T10:30Z"),
      };
      const created = await createHold(
        eventType!.id,
        [host!.id],
        slot,
        Temporal.Duration.from({ minutes: 10 }),
        db,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const invitee = {
        email: "invitee@example.test",
        name: "Invitee",
        timezone: "UTC",
      };
      const optionId = crypto.randomUUID();
      const publicId = "proposal-acceptance-test";
      await db.insert(schema.proposals).values({
        publicId,
        workspaceId: eventType!.workspaceId,
        engagementId: engagement!.id,
        eventTypeId: eventType!.id,
        ownerUserId: host!.id,
        title: "Acme kickoff",
        recipientName: invitee.name,
        recipientEmail: invitee.email,
        status: "awaiting_client",
        expiresAt: new Date("2028-01-01T00:00:00Z"),
        options: [{
          id: optionId,
          start: slot.start.toString(),
          end: slot.end.toString(),
          hostUserIds: [host!.id],
          recommendation: {
            confidence: "confirmed",
            reasons: [{
              kind: "positive",
              label: "Calendar checked",
              detail: "Current evidence shows the organizer is available.",
            }, {
              kind: "positive",
              label: "Fits the booking rules",
              detail: "This time satisfies the scheduling rules.",
            }],
          },
        }],
      });

      const confirmed = await confirmHold(
        created.value.map((hold) => hold.id),
        invitee,
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { eventTypeId: eventType!.id },
        publicId,
      );
      expect(confirmed.ok).toBe(true);
      const [proposal] = await db.select().from(schema.proposals)
        .where(eq(schema.proposals.publicId, publicId));
      expect(proposal?.status).toBe("accepted");
      expect(proposal?.acceptedOptionId).toBe(optionId);
      expect(proposal?.bookingId).toBe(confirmed.ok ? confirmed.value.bookingId : null);
      const events = await db.select().from(schema.proposalEvents)
        .where(eq(schema.proposalEvents.proposalId, proposal!.id));
      expect(events.map((event) => event.kind)).toEqual(["accepted"]);
    } finally {
      await pool.end();
    }
  });
});

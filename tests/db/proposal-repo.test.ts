import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  createProposal,
  getProposal,
  getPublicProposal,
  requestProposalAlternative,
  transitionStoredProposal,
} from "../../src/db/proposal-repo";
import { createEngagement } from "../../src/db/engagement-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("proposal repository", () => {
  test("persists the review lifecycle and token-scoped client response", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.proposals}, ${schema.engagementPeople},
          ${schema.engagements}, ${schema.clients}, ${schema.workspaceMembers},
          ${schema.workspaces}, ${schema.users}
        restart identity cascade
      `);
      const [owner] = await db.insert(schema.users).values({
        name: "Owner",
        email: "proposal-owner@example.test",
      }).returning();
      const [workspace] = await db.insert(schema.workspaces).values({
        name: "Agency",
        slug: "proposal-agency",
      }).returning();
      await db.insert(schema.workspaceMembers).values({
        workspaceId: workspace!.id,
        userId: owner!.id,
        role: "owner",
      });
      const [schedule] = await db.insert(schema.schedules).values({
        userId: owner!.id,
        name: "Client work",
        timezone: "UTC",
        rules: [{ dow: 1, start: "09:00", end: "17:00" }],
      }).returning();
      const actor = { userId: owner!.id, workspaceRole: "owner" as const };
      const { engagement } = await createEngagement(workspace!.id, actor, {
        clientName: "Acme",
        name: "Website launch",
        type: "project",
        status: "active",
        visibility: "workspace",
        accountLeadUserId: owner!.id,
      }, db);
      const [eventType] = await db.insert(schema.eventTypes).values({
        workspaceId: workspace!.id,
        engagementId: engagement.id,
        ownerUserId: owner!.id,
        scheduleId: schedule!.id,
        slug: "proposal-kickoff",
        title: "Kickoff",
        description: "Align scope and first milestone.",
        purpose: "Align scope",
        outcomeDefinition: "First milestone agreed",
        participantRoles: [{ role: "account_lead", required: true }],
        playbookStatus: "ready",
        durationMinutes: 30,
      }).returning();
      await db.insert(schema.eventTypeHosts).values({
        eventTypeId: eventType!.id,
        userId: owner!.id,
        role: "required",
      });
      const recommendation = {
        confidence: "confirmed" as const,
        reasons: [{
          kind: "positive" as const,
          label: "Calendar checked",
          detail: "Current evidence shows the organizer is available.",
        }, {
          kind: "positive" as const,
          label: "Fits the booking rules",
          detail: "This time satisfies the scheduling rules.",
        }],
      };
      const created = await createProposal(workspace!.id, actor, engagement.id, {
        eventTypeId: eventType!.id,
        title: "Acme kickoff",
        message: "Choose a time.",
        recipientName: "Maya",
        recipientEmail: "maya@example.test",
        expiresAt: new Date("2099-01-20T00:00:00Z"),
        options: [{
          id: crypto.randomUUID(),
          start: "2027-01-10T15:00:00Z",
          end: "2027-01-10T15:30:00Z",
          hostUserIds: [owner!.id],
          recommendation,
        }, {
          id: crypto.randomUUID(),
          start: "2027-01-11T15:00:00Z",
          end: "2027-01-11T15:30:00Z",
          hostUserIds: [owner!.id],
          recommendation,
        }],
      }, db);
      expect(created.kind).toBe("created");
      if (created.kind !== "created") throw new Error("proposal was not created");

      const ready = await transitionStoredProposal(
        workspace!.id,
        actor,
        created.proposal.id,
        "mark_ready",
        db,
      );
      expect(ready.kind).toBe("updated");
      const sent = await transitionStoredProposal(
        workspace!.id,
        actor,
        created.proposal.id,
        "send",
        db,
      );
      expect(sent.kind).toBe("updated");

      const publicProposal = await getPublicProposal(created.proposal.publicId, db);
      expect(publicProposal?.status).toBe("awaiting_client");
      expect(publicProposal?.participants.map((person) => person.name)).toEqual(["Owner"]);
      expect(publicProposal?.workspaceName).toBe("Agency");

      const response = await requestProposalAlternative(
        created.proposal.publicId,
        "Tuesday afternoons are best.",
        db,
      );
      expect(response?.alternativeRequest).toBe("Tuesday afternoons are best.");
      const organizer = await getProposal(
        workspace!.id,
        actor,
        created.proposal.id,
        db,
      );
      expect(organizer?.activity.map((event) => event.kind)).toEqual([
        "created",
        "mark_ready",
        "send",
        "alternative_requested",
      ]);
    } finally {
      await pool.end();
    }
  });
});

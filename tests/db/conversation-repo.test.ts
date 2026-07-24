import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  attachConversationPlaybook,
  createConversationPlaybook,
  getConversationPlaybook,
  listEngagementConversations,
  updateConversationPlaybook,
} from "../../src/db/conversation-repo";
import { createEngagement } from "../../src/db/engagement-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("conversation repository", () => {
  test("maps a playbook onto event-type availability without changing its identity", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.engagementPeople}, ${schema.engagements},
          ${schema.clients}, ${schema.workspaceMembers}, ${schema.workspaces},
          ${schema.users}
        restart identity cascade
      `);
      const [lead] = await db.insert(schema.users).values({
        name: "Lead",
        email: "conversation-lead@example.test",
      }).returning();
      const [workspace] = await db.insert(schema.workspaces).values({
        name: "Agency",
        slug: "conversation-test",
      }).returning();
      await db.insert(schema.workspaceMembers).values({
        workspaceId: workspace!.id,
        userId: lead!.id,
        role: "member",
      });
      const [schedule] = await db.insert(schema.schedules).values({
        userId: lead!.id,
        name: "Client work",
        timezone: "America/New_York",
        rules: [{ dow: 1, start: "09:00", end: "17:00" }],
      }).returning();
      const actor = { userId: lead!.id, workspaceRole: "member" as const };
      const { engagement } = await createEngagement(workspace!.id, actor, {
        clientName: "Acme",
        name: "Website launch",
        type: "project",
        status: "active",
        visibility: "workspace",
        accountLeadUserId: lead!.id,
      }, db);
      const created = await createConversationPlaybook(
        workspace!.id,
        actor,
        engagement.id,
        {
          title: "Kickoff",
          purpose: "Align scope",
          clientExplanation: "Meet the team and agree on the first milestone.",
          durationMinutes: 45,
          selectableDurations: [30, 45],
          participantRoles: [{ role: "account_lead", required: true }],
          preparationItems: [{ label: "Client brief", required: true }],
          outcomeDefinition: null,
          status: "draft",
          hostUserId: lead!.id,
          scheduleId: schedule!.id,
        },
        db,
      );
      expect(created.kind).toBe("created");
      if (created.kind !== "created") throw new Error("playbook creation failed");

      const blocked = await updateConversationPlaybook(
        workspace!.id,
        actor,
        engagement.id,
        created.playbook.id,
        { ...created.playbook, outcomeDefinition: null, status: "ready" },
        db,
      );
      expect(blocked).toEqual({ kind: "not_ready", issues: ["outcome"] });

      const updated = await updateConversationPlaybook(
        workspace!.id,
        actor,
        engagement.id,
        created.playbook.id,
        {
          ...created.playbook,
          outcomeDefinition: "Scope, owners, and first milestone agreed",
          status: "ready",
        },
        db,
      );
      expect(updated.kind).toBe("updated");
      const listed = await listEngagementConversations(
        workspace!.id,
        actor,
        engagement.id,
        db,
      );
      expect(listed?.[0]?.readiness).toEqual({ ready: true, issues: [] });
      const loaded = await getConversationPlaybook(
        workspace!.id,
        actor,
        engagement.id,
        created.playbook.id,
        db,
      );
      expect(loaded?.playbook.slug).toBe("kickoff");
      expect(loaded?.playbook.durationMinutes).toBe(45);

      const [template] = await db.insert(schema.eventTypes).values({
        workspaceId: workspace!.id,
        ownerUserId: lead!.id,
        slug: "weekly-check-in",
        title: "Weekly check-in",
        durationMinutes: 30,
        scheduleId: schedule!.id,
        purpose: "Keep delivery moving",
        participantRoles: [{ role: "account_lead", required: true }],
        outcomeDefinition: "Blockers have owners",
      }).returning();
      await db.insert(schema.eventTypeHosts).values({
        eventTypeId: template!.id,
        userId: lead!.id,
        role: "member",
        weight: 1,
      });
      expect(await attachConversationPlaybook(
        workspace!.id,
        actor,
        engagement.id,
        template!.id,
        db,
      )).toBe("attached");
      const afterTemplate = await db.query.eventTypes.findFirst({
        where: (eventType, { eq }) => eq(eventType.id, template!.id),
      });
      expect(afterTemplate?.engagementId).toBeNull();
      const conversations = await listEngagementConversations(
        workspace!.id,
        actor,
        engagement.id,
        db,
      );
      expect(conversations?.map((item) => item.slug)).toContain("weekly-check-in-2");
    } finally {
      await pool.end();
    }
  });
});

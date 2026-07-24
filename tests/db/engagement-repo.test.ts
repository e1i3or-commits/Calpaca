import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  createEngagement,
  findSimilarClients,
  getEngagement,
  listEngagements,
} from "../../src/db/engagement-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("engagement repository", () => {
  test("reuses clients and prevents unauthorized restricted discovery", async () => {
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
      const [lead, contributor, outsider] = await db.insert(schema.users).values([
        { name: "Lead", email: "engagement-lead@example.test" },
        { name: "Contributor", email: "engagement-contributor@example.test" },
        { name: "Outsider", email: "engagement-outsider@example.test" },
      ]).returning();
      const [workspace] = await db.insert(schema.workspaces).values({
        name: "Agency",
        slug: "engagement-test",
      }).returning();
      await db.insert(schema.workspaceMembers).values([
        { workspaceId: workspace!.id, userId: lead!.id, role: "member" },
        { workspaceId: workspace!.id, userId: contributor!.id, role: "member" },
        { workspaceId: workspace!.id, userId: outsider!.id, role: "member" },
      ]);
      const actor = { userId: lead!.id, workspaceRole: "member" as const };
      const first = await createEngagement(workspace!.id, actor, {
        clientName: "Acme  Studio",
        name: "Website launch",
        type: "project",
        status: "potential",
        visibility: "restricted",
        accountLeadUserId: lead!.id,
        people: [{ userId: contributor!.id, role: "delivery_lead" }],
      }, db);
      const second = await createEngagement(workspace!.id, actor, {
        clientName: " acme studio ",
        name: "Retainer",
        type: "retainer",
        status: "active",
        visibility: "workspace",
        accountLeadUserId: lead!.id,
      }, db);

      expect(second.client.id).toBe(first.client.id);
      expect(await findSimilarClients(workspace!.id, "Acme Studio", db))
        .toEqual([{ id: first.client.id, name: "Acme  Studio" }]);
      expect((await listEngagements(workspace!.id, {
        userId: contributor!.id,
        workspaceRole: "member",
      }, {}, db)).map((item) => item.id)).toContain(first.engagement.id);
      expect((await listEngagements(workspace!.id, {
        userId: outsider!.id,
        workspaceRole: "member",
      }, {}, db)).map((item) => item.id)).not.toContain(first.engagement.id);
      expect(await getEngagement(workspace!.id, {
        userId: outsider!.id,
        workspaceRole: "member",
      }, first.engagement.id, db)).toBeNull();
      expect(await getEngagement(workspace!.id, {
        userId: contributor!.id,
        workspaceRole: "member",
      }, first.engagement.id, db)).not.toBeNull();
    } finally {
      await pool.end();
    }
  });
});

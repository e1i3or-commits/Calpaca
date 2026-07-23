import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  addWorkspaceDomain,
  ensureWorkspaceForUser,
  getWorkspaceContext,
  resolvePublicWorkspace,
  resolveWorkspaceByHostname,
} from "../../src/db/workspace-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("workspace repository", () => {
  test("backfills existing users and resolves only verified domains", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.workspaceDomains}, ${schema.workspaceMembers},
          ${schema.workspaces}, ${schema.users}
        restart identity cascade
      `);
      const [owner, member] = await db.insert(schema.users).values([
        { name: "Owner", email: "owner@example.test", appRole: "owner" },
        { name: "Member", email: "member@example.test" },
      ]).returning();

      const ownerWorkspace = await ensureWorkspaceForUser(owner!.id, db);
      const memberWorkspace = await ensureWorkspaceForUser(member!.id, db);
      expect(memberWorkspace.workspaceId).toBe(ownerWorkspace.workspaceId);
      expect(ownerWorkspace.role).toBe("owner");
      expect(memberWorkspace.role).toBe("member");
      expect((await getWorkspaceContext(
        ownerWorkspace.workspaceId,
        owner!.id,
        db,
      ))?.plan).toBe("self_hosted");

      const domain = await addWorkspaceDomain(
        ownerWorkspace.workspaceId,
        "cal.example.com",
        db,
      );
      expect(domain.dnsRecord.name).toBe("_calpaca.cal.example.com");
      expect(await resolveWorkspaceByHostname("cal.example.com", db)).toBeNull();
      await db.update(schema.workspaceDomains)
        .set({ status: "verified" })
        .where(sql`${schema.workspaceDomains.id} = ${domain.id}`);
      expect(await resolveWorkspaceByHostname("CAL.EXAMPLE.COM.", db))
        .toBe(ownerWorkspace.workspaceId);
      expect(await resolvePublicWorkspace({
        hostname: "cal.example.com",
      }, db)).toEqual({
        id: ownerWorkspace.workspaceId,
        slug: "default",
      });
      expect(await resolvePublicWorkspace({
        hostname: "calpaca.io",
        workspaceSlug: "default",
      }, db)).toEqual({
        id: ownerWorkspace.workspaceId,
        slug: "default",
      });
    } finally {
      await pool.end();
    }
  });

  test("hosted self-signups receive separate free workspaces", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    const priorMode = process.env.CALPACA_DEPLOYMENT_MODE;
    process.env.CALPACA_DEPLOYMENT_MODE = "hosted";
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.workspaceDomains}, ${schema.workspaceMembers},
          ${schema.workspaces}, ${schema.users}
        restart identity cascade
      `);
      const [one, two] = await db.insert(schema.users).values([
        { name: "One", email: "one@example.test" },
        { name: "Two", email: "two@example.test" },
      ]).returning();
      const first = await ensureWorkspaceForUser(one!.id, db);
      const second = await ensureWorkspaceForUser(two!.id, db);
      expect(first.workspaceId).not.toBe(second.workspaceId);
      expect(first.role).toBe("owner");
      expect(second.role).toBe("owner");
      const rows = await db.select().from(schema.workspaces);
      expect(rows.map((workspace) => workspace.plan)).toEqual(["free", "free"]);
    } finally {
      if (priorMode === undefined) delete process.env.CALPACA_DEPLOYMENT_MODE;
      else process.env.CALPACA_DEPLOYMENT_MODE = priorMode;
      await pool.end();
    }
  });
});

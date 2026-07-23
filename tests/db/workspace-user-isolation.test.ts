import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  createUserInvitation,
  getManagementDirectory,
  updateManagedUser,
} from "../../src/db/user-management-repo";
import { listTeamsForUser } from "../../src/db/admin-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("workspace user isolation", () => {
  test("directories, updates, and invitations stay inside the actor workspace", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.userInvitations}, ${schema.workspaceMembers},
          ${schema.workspaces}, ${schema.users}
        restart identity cascade
      `);
      const [alpha, beta] = await db.insert(schema.workspaces).values([
        { name: "Alpha", slug: "alpha", plan: "pro" },
        { name: "Beta", slug: "beta", plan: "pro" },
      ]).returning();
      const [alphaOwner, betaOwner] = await db.insert(schema.users).values([
        { name: "Alpha Owner", email: "alpha@example.test" },
        { name: "Beta Owner", email: "beta@example.test" },
      ]).returning();
      await db.insert(schema.workspaceMembers).values([
        { workspaceId: alpha!.id, userId: alphaOwner!.id, role: "owner" },
        { workspaceId: beta!.id, userId: betaOwner!.id, role: "owner" },
      ]);
      await db.insert(schema.teams).values([
        { workspaceId: alpha!.id, name: "Alpha Team", slug: "team" },
        { workspaceId: beta!.id, name: "Beta Team", slug: "team" },
      ]);

      const directory = await getManagementDirectory(alphaOwner!.id, alpha!.id, db);
      expect(directory?.users.map((user) => user.email)).toEqual(["alpha@example.test"]);
      expect((await listTeamsForUser(
        alphaOwner!.id,
        db,
        alpha!.id,
      )).map((team) => team.name)).toEqual(["Alpha Team"]);
      expect(await updateManagedUser(
        alphaOwner!.id,
        betaOwner!.id,
        { role: "member" },
        alpha!.id,
        db,
      )).toBe("not_found");

      const invitation = await createUserInvitation(
        alphaOwner!.id,
        "new@example.test",
        "member",
        new Date("2027-01-01T00:00:00Z"),
        alpha!.id,
        db,
      );
      expect(typeof invitation).not.toBe("string");
      if (typeof invitation !== "string") {
        const rows = await db.select().from(schema.userInvitations);
        expect(rows[0]?.workspaceId).toBe(alpha!.id);
      }
    } finally {
      await pool.end();
    }
  });
});

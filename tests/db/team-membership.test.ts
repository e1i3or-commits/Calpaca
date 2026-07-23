import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  isTeamAdmin,
  listTeamsForUser,
  removeTeamMember,
  updateTeamMemberAdmin,
} from "../../src/db/admin-repo";
import * as schema from "../../src/db/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("team membership administration", () => {
  test("protects the final admin, then permits removal after promotion", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.teamMembers}, ${schema.teams}, ${schema.users}
        restart identity cascade
      `);
      const [owner, member] = await db
        .insert(schema.users)
        .values([
          { name: "Owner", email: "owner@example.test", appRole: "owner" },
          { name: "Member", email: "member@example.test" },
        ])
        .returning();
      const [team] = await db
        .insert(schema.teams)
        .values({ name: "Support", slug: "support" })
        .returning();
      await db.insert(schema.teams).values({ name: "Unassigned", slug: "unassigned" });
      await db.insert(schema.teamMembers).values([
        { teamId: team!.id, userId: owner!.id, isAdmin: true },
        { teamId: team!.id, userId: member!.id, isAdmin: false },
      ]);

      expect((await listTeamsForUser(owner!.id, db)).map((row) => row.slug)).toEqual([
        "support",
        "unassigned",
      ]);
      expect((await listTeamsForUser(member!.id, db)).map((row) => row.slug)).toEqual([
        "support",
      ]);
      expect(await removeTeamMember(team!.id, owner!.id, db)).toBe("last_admin");
      expect(await updateTeamMemberAdmin(team!.id, owner!.id, false, db)).toBe("last_admin");

      expect(await updateTeamMemberAdmin(team!.id, member!.id, true, db)).toBe("updated");
      expect(await isTeamAdmin(team!.id, member!.id, db)).toBe(true);
      expect(await removeTeamMember(team!.id, owner!.id, db)).toBe("removed");
      expect(await isTeamAdmin(team!.id, owner!.id, db)).toBe(false);
    } finally {
      await pool.end();
    }
  });
});

import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  cancelSignupRegistrations,
  createSignupSheet,
  getPublicSignupSheet,
  registerForSignupSessions,
} from "../../src/db/signup-sheet-repo";

describe.skipIf(!process.env.TEST_DATABASE_URL)("sign-up sheets", () => {
  test("enforces capacity, questions, per-person limits, and cancellation", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.signupRegistrations}, ${schema.signupSessions},
          ${schema.signupSheets}, ${schema.workspaceMembers}, ${schema.workspaces},
          ${schema.users} restart identity cascade
      `);
      const [owner] = await db.insert(schema.users).values({
        name: "Owner",
        email: "owner@signup.test",
      }).returning();
      const [workspace] = await db.insert(schema.workspaces).values({
        name: "Signup workspace",
        slug: "signup-workspace",
      }).returning();
      const sheet = await createSignupSheet({
        workspaceId: workspace!.id,
        ownerUserId: owner!.id,
        title: "Workshops",
        timezone: "UTC",
        maxRegistrationsPerPerson: 1,
        questions: [{ id: "role", label: "Role", required: true }],
        sessions: [
          {
            title: "Session A",
            startsAt: new Date("2027-08-01T10:00:00Z"),
            endsAt: new Date("2027-08-01T11:00:00Z"),
            capacity: 1,
          },
          {
            title: "Session B",
            startsAt: new Date("2027-08-02T10:00:00Z"),
            endsAt: new Date("2027-08-02T11:00:00Z"),
            capacity: 2,
          },
        ],
      }, db);
      expect(await registerForSignupSessions({
        publicId: sheet.publicId,
        sessionIds: [sheet.sessions[0]!.id],
        name: "First",
        email: "first@example.test",
        answers: {},
      }, db)).toBe("missing_answers");
      const first = await registerForSignupSessions({
        publicId: sheet.publicId,
        sessionIds: [sheet.sessions[0]!.id],
        name: "First",
        email: "first@example.test",
        answers: { role: "Designer" },
      }, db);
      expect(typeof first).toBe("object");
      if (typeof first !== "object") throw new Error("registration failed");
      expect(await registerForSignupSessions({
        publicId: sheet.publicId,
        sessionIds: [sheet.sessions[1]!.id],
        name: "First",
        email: "first@example.test",
        answers: { role: "Designer" },
      }, db)).toBe("registration_limit");
      expect(await registerForSignupSessions({
        publicId: sheet.publicId,
        sessionIds: [sheet.sessions[0]!.id],
        name: "Second",
        email: "second@example.test",
        answers: { role: "Engineer" },
      }, db)).toBe("session_full");
      expect(await cancelSignupRegistrations(first.cancelToken, db)).toBe(true);
      const racers = await Promise.all([
        registerForSignupSessions({
          publicId: sheet.publicId,
          sessionIds: [sheet.sessions[0]!.id],
          name: "Second",
          email: "second@example.test",
          answers: { role: "Engineer" },
        }, db),
        registerForSignupSessions({
          publicId: sheet.publicId,
          sessionIds: [sheet.sessions[0]!.id],
          name: "Third",
          email: "third@example.test",
          answers: { role: "Manager" },
        }, db),
      ]);
      expect(racers.filter((result) => typeof result === "object")).toHaveLength(1);
      expect(racers.filter((result) => result === "session_full")).toHaveLength(1);
      const publicSheet = await getPublicSignupSheet(sheet.publicId, db);
      expect(publicSheet?.sessions[0]?.registrationCount).toBe(1);
      expect(publicSheet?.sessions[0]?.registrations).toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});

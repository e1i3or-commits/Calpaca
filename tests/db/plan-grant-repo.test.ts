import { beforeAll, describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";
import {
  claimPlanGrant,
  findOwnedWorkspace,
  revokePlanGrant,
  upsertPlanGrant,
} from "../../src/db/plan-grant-repo";
import { getWorkspaceContext } from "../../src/db/workspace-repo";

type TestDb = NodePgDatabase<typeof schema>;

const NOW = Temporal.Instant.from("2026-08-11T12:00:00Z");

/** Same no-truncate convention as tests/db/event-type-folders.test.ts: these
 * tables are shared with ~20 concurrently-running files, so every test mints
 * fixtures with identifiers unique to itself. */
describe.skipIf(!process.env.TEST_DATABASE_URL)("plan grants", () => {
  let pool: Pool;
  let db: TestDb;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  async function fixture(tag: string) {
    const email = `grant-${tag}@example.test`;
    const [workspace] = await db.insert(schema.workspaces).values({
      name: `Grant ${tag}`,
      slug: `grant-${tag}`,
      plan: "free",
    }).returning();
    const [user] = await db.insert(schema.users).values({
      name: "Beta Tester",
      email,
    }).returning();
    await db.insert(schema.workspaceMembers).values({
      workspaceId: workspace!.id,
      userId: user!.id,
      role: "owner",
    });
    return { email, userId: user!.id, workspaceId: workspace!.id };
  }

  test("claiming upgrades the workspace and starts the clock at claim time", async () => {
    const { email, userId, workspaceId } = await fixture("claim");
    await upsertPlanGrant({ email, plan: "pro", trialDays: 365 }, db);

    const applied = await claimPlanGrant({ userId, email, workspaceId }, NOW, db);
    expect(applied).toEqual({ plan: "pro", expiresAt: "2027-08-11T12:00:00Z" });

    const context = await getWorkspaceContext(workspaceId, userId, db);
    expect(context?.plan).toBe("pro");
    expect(context?.entitlements.meetingPolls).toBe(true);
    expect(context?.trial?.expired).toBe(false);
  });

  // Otherwise a tester could extend their own year by signing out and back in.
  test("a claimed grant is never applied twice", async () => {
    const { email, userId, workspaceId } = await fixture("once");
    await upsertPlanGrant({ email, plan: "pro", trialDays: 30 }, db);
    expect(await claimPlanGrant({ userId, email, workspaceId }, NOW, db)).not.toBeNull();
    expect(await claimPlanGrant({ userId, email, workspaceId }, NOW, db)).toBeNull();
  });

  test("re-granting replaces the pending promise instead of stacking one", async () => {
    const { email, userId, workspaceId } = await fixture("regrant");
    await upsertPlanGrant({ email, plan: "pro", trialDays: 30 }, db);
    await upsertPlanGrant({ email, plan: "business", trialDays: 365 }, db);

    const applied = await claimPlanGrant({ userId, email, workspaceId }, NOW, db);
    expect(applied?.plan).toBe("business");
    // The superseded grant is revoked, not left pending beside the new one.
    const rows = await db
      .select({ status: schema.planGrants.status, plan: schema.planGrants.plan })
      .from(schema.planGrants)
      .where(eq(schema.planGrants.email, email));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === "pending")).toHaveLength(0);
    expect(rows.filter((row) => row.status === "revoked")).toHaveLength(1);
    expect(rows.filter((row) => row.status === "claimed")).toHaveLength(1);
  });

  test("email matching ignores case and surrounding whitespace", async () => {
    const { email, userId, workspaceId } = await fixture("case");
    await upsertPlanGrant({ email: `  ${email.toUpperCase()} `, plan: "pro", trialDays: 10 }, db);
    expect(await claimPlanGrant({ userId, email, workspaceId }, NOW, db)).not.toBeNull();
  });

  test("revoking a pending grant stops it applying at sign-in", async () => {
    const { email, userId, workspaceId } = await fixture("revoke");
    await upsertPlanGrant({ email, plan: "pro", trialDays: 365 }, db);
    expect(await revokePlanGrant(email, db)).toBe(1);
    expect(await claimPlanGrant({ userId, email, workspaceId }, NOW, db)).toBeNull();

    const context = await getWorkspaceContext(workspaceId, userId, db);
    expect(context?.plan).toBe("free");
  });

  test("no grant for an address is a no-op, not an error", async () => {
    const { userId, workspaceId } = await fixture("none");
    expect(
      await claimPlanGrant(
        { userId, email: "nobody-here@example.test", workspaceId },
        NOW,
        db,
      ),
    ).toBeNull();
  });

  // The whole point of resolving on read: an elapsed trial stops granting paid
  // capabilities without any scheduled downgrade having to run.
  test("an elapsed trial reads as free while remembering what was granted", async () => {
    const { email, userId, workspaceId } = await fixture("elapsed");
    await upsertPlanGrant({ email, plan: "pro", trialDays: 1 }, db);
    await claimPlanGrant(
      { userId, email, workspaceId },
      Temporal.Instant.from("2020-01-01T00:00:00Z"),
      db,
    );
    const context = await getWorkspaceContext(workspaceId, userId, db);
    expect(context?.plan).toBe("free");
    expect(context?.grantedPlan).toBe("pro");
    expect(context?.trial?.expired).toBe(true);
    expect(context?.entitlements.meetingPolls).toBe(false);
  });

  test("finds the workspace someone owns, and ignores ones they merely joined", async () => {
    const owner = await fixture("owner");
    const other = await fixture("joined");
    await db.insert(schema.workspaceMembers).values({
      workspaceId: other.workspaceId,
      userId: owner.userId,
      role: "member",
    });
    const found = await findOwnedWorkspace(owner.email, db);
    expect(found?.workspaceId).toBe(owner.workspaceId);
    expect(found?.slug).toBe("grant-owner");
  });

  test("returns nothing for an address with no account", async () => {
    expect(await findOwnedWorkspace("never-signed-up@example.test", db)).toBeNull();
  });
});

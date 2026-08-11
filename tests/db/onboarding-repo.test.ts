import { beforeAll, describe, expect, test } from "bun:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";
import {
  completeOnboarding,
  getOnboardingFacts,
  recordOnboardingStep,
} from "../../src/db/onboarding-repo";

type TestDb = NodePgDatabase<typeof schema>;

/**
 * Exercises the aggregate SQL behind the first-run wizard against real
 * Postgres — filtered counts and the monotonic step marker are the parts that
 * typecheck fine and still return the wrong number. Follows the convention in
 * tests/db/event-type-folders.test.ts: no truncate, every test mints its own
 * workspace/user with identifiers unique to that test, because these tables are
 * shared with ~20 concurrently-running files.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("onboarding repo", () => {
  let pool: Pool;
  let db: TestDb;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  async function fixture(tag: string) {
    const [workspace] = await db.insert(schema.workspaces).values({
      name: `Onboarding ${tag}`,
      slug: `onboarding-${tag}`,
      plan: "free",
    }).returning();
    const [user] = await db.insert(schema.users).values({
      name: "Kai Kaapro",
      email: `onboarding-${tag}@example.test`,
    }).returning();
    await db.insert(schema.workspaceMembers).values({
      workspaceId: workspace!.id,
      userId: user!.id,
      role: "owner",
    });
    return { workspaceId: workspace!.id, userId: user!.id };
  }

  test("a brand-new host has no progress and nothing bookable", async () => {
    const { userId, workspaceId } = await fixture("fresh");
    const facts = await getOnboardingFacts(userId, workspaceId, db);
    expect(facts).toMatchObject({
      furthestStep: null,
      completedAt: null,
      workspace: { slug: "onboarding-fresh" },
      calendars: { connectedCount: 0, blockingCount: 0, hasWriteDestination: false },
      scheduleCount: 0,
      eventTypeCount: 0,
    });
  });

  test("counts only the connections that actually block time", async () => {
    const { userId, workspaceId } = await fixture("calendars");
    await db.insert(schema.calendarConnections).values([
      { userId, provider: "google", externalCalendarId: "primary", conflictEnabled: true },
      { userId, provider: "google", externalCalendarId: "side", conflictEnabled: false },
      { userId, provider: "google", externalCalendarId: "other", conflictEnabled: false },
    ]);
    const facts = await getOnboardingFacts(userId, workspaceId, db);
    expect(facts?.calendars.connectedCount).toBe(3);
    expect(facts?.calendars.blockingCount).toBe(1);
  });

  test("sees a schedule and an event type once they exist", async () => {
    const { userId, workspaceId } = await fixture("publish");
    await db.insert(schema.schedules).values({
      userId,
      name: "Working hours",
      timezone: "America/New_York",
      rules: [{ dow: 1, start: "09:00", end: "17:00" }],
    });
    await db.insert(schema.eventTypes).values({
      workspaceId,
      ownerUserId: userId,
      slug: "intro-call",
      title: "30 minute meeting",
      durationMinutes: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
      minimumNoticeMin: 120,
      rollingWindowDays: 30,
      mode: "solo",
    });
    const facts = await getOnboardingFacts(userId, workspaceId, db);
    expect(facts?.scheduleCount).toBe(1);
    expect(facts?.eventTypeCount).toBe(1);
  });

  test("does not count another workspace's event types", async () => {
    const mine = await fixture("scoped-mine");
    const theirs = await fixture("scoped-theirs");
    await db.insert(schema.eventTypes).values({
      workspaceId: theirs.workspaceId,
      ownerUserId: mine.userId,
      slug: "elsewhere",
      title: "Elsewhere",
      durationMinutes: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      minimumNoticeMin: 0,
      rollingWindowDays: 30,
      mode: "solo",
    });
    const facts = await getOnboardingFacts(mine.userId, mine.workspaceId, db);
    expect(facts?.eventTypeCount).toBe(0);
  });

  test("the step marker only moves forward", async () => {
    const { userId, workspaceId } = await fixture("steps");
    expect(await recordOnboardingStep(userId, "calendars", db)).toBe("calendars");
    expect(await recordOnboardingStep(userId, "publish", db)).toBe("publish");
    // Stepping back to fix an earlier answer must not lose later progress.
    expect(await recordOnboardingStep(userId, "profile", db)).toBe("publish");
    expect((await getOnboardingFacts(userId, workspaceId, db))?.furthestStep).toBe("publish");
  });

  test("completing stamps a timestamp and pins the step to the last one", async () => {
    const { userId, workspaceId } = await fixture("complete");
    const at = new Date("2026-08-11T12:00:00.000Z");
    expect(await completeOnboarding(userId, at, db)).toBe("2026-08-11T12:00:00.000Z");
    const facts = await getOnboardingFacts(userId, workspaceId, db);
    expect(facts?.completedAt).toBe("2026-08-11T12:00:00.000Z");
    expect(facts?.furthestStep).toBe("publish");
  });

  test("returns null when the workspace does not exist", async () => {
    const { userId } = await fixture("missing");
    const absent = await getOnboardingFacts(
      userId,
      "00000000-0000-4000-8000-000000000000",
      db,
    );
    expect(absent).toBeNull();
  });
});

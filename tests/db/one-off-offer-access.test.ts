import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";
import {
  getEventTypeForAdmin,
  getEventTypeForHost,
  listEventTypesForUser,
} from "../../src/db/admin-repo";

type TestDb = NodePgDatabase<typeof schema>;

/**
 * Regression for the one-off offer picker refusing a type it had just listed.
 * listEventTypesForUser shows a team member every type their team owns, but
 * the offer routes authorized with getEventTypeForAdmin (owner / workspace
 * admin / team admin only), so a plain member hosting a team type saw
 * "event_type_not_found" the moment they submitted. getEventTypeForHost is
 * the picker's contract: anything the list returns, it accepts.
 *
 * Same conventions as tests/db/event-type-folders.test.ts — one pool, one
 * migration, no truncation, fixtures with identifiers unique to this file.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("event type access for one-off offers", () => {
  let pool: Pool;
  let db: TestDb;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function fixture(tag: string) {
    const [workspace] = await db.insert(schema.workspaces)
      .values({ name: `offer-access-${tag}`, slug: `offer-access-${tag}` }).returning();
    const [otherWorkspace] = await db.insert(schema.workspaces)
      .values({ name: `offer-access-${tag}-other`, slug: `offer-access-${tag}-other` }).returning();
    const [host] = await db.insert(schema.users)
      .values({ name: "Host", email: `offer-access-${tag}-host@example.test` }).returning();
    const [member] = await db.insert(schema.users)
      .values({ name: "Member", email: `offer-access-${tag}-member@example.test` }).returning();
    const [stranger] = await db.insert(schema.users)
      .values({ name: "Stranger", email: `offer-access-${tag}-stranger@example.test` }).returning();
    const [team] = await db.insert(schema.teams)
      .values({ workspaceId: workspace!.id, name: "Franchise Success", slug: `offer-access-${tag}` })
      .returning();
    await db.insert(schema.teamMembers).values([
      { teamId: team!.id, userId: host!.id, isAdmin: false },
      { teamId: team!.id, userId: member!.id, isAdmin: false },
    ]);
    const [eventType] = await db.insert(schema.eventTypes).values({
      workspaceId: workspace!.id,
      teamId: team!.id,
      slug: `offer-access-${tag}-call`,
      title: "Franchise Success Call",
      durationMinutes: 30,
    }).returning();
    await db.insert(schema.eventTypeHosts).values({ eventTypeId: eventType!.id, userId: host!.id });
    return {
      workspace: workspace!,
      otherWorkspace: otherWorkspace!,
      host: host!,
      member: member!,
      stranger: stranger!,
      eventType: eventType!,
    };
  }

  test("a non-admin host of a team type can offer times on it even though they cannot manage it", async () => {
    const f = await fixture("host");

    expect(await getEventTypeForAdmin(f.eventType.id, f.host.id, db, f.workspace.id)).toBeNull();

    const offered = await getEventTypeForHost(f.eventType.id, f.host.id, db, f.workspace.id);
    expect(offered?.id).toBe(f.eventType.id);
    expect(offered?.hosts.map((h) => h.userId)).toEqual([f.host.id]);
  });

  test("accepts exactly what the picker lists: team members yes, strangers and other workspaces no", async () => {
    const f = await fixture("list");

    const listed = await listEventTypesForUser(f.member.id, db, f.workspace.id);
    expect(listed.map((et) => et.id)).toContain(f.eventType.id);
    expect((await getEventTypeForHost(f.eventType.id, f.member.id, db, f.workspace.id))?.id)
      .toBe(f.eventType.id);

    expect(await getEventTypeForHost(f.eventType.id, f.stranger.id, db, f.workspace.id)).toBeNull();
    expect(await getEventTypeForHost(f.eventType.id, f.host.id, db, f.otherWorkspace.id)).toBeNull();
  });
});

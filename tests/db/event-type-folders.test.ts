import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  createEventTypeFolder,
  deleteEventTypeFolder,
  listEventTypeFolders,
  listEventTypesForUser,
  setEventTypeFolder,
  updateEventTypeFolder,
  type EventTypeFolderRecord,
} from "../../src/db/admin-repo";

type TestDb = NodePgDatabase<typeof schema>;

/**
 * Integration coverage for event type folders against a real Postgres
 * instance (same convention as tests/db/holds-repo.test.ts): one pool,
 * one migration, one truncate for the whole file — not per test. Bun runs
 * test files concurrently, and this file's tables (workspaces, users,
 * event_types) are shared with ~20 other tests/db/*.test.ts files, so a
 * truncate here (which cascades) races every one of them; six truncates
 * per run instead of one made this file six times as disruptive as its
 * neighbours. Since the tables are no longer wiped between tests, every
 * test below creates its own workspace/user/event-type fixtures with
 * identifiers unique to that test so they can't collide with each other.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("event type folders", () => {
  let pool: Pool;
  let db: TestDb;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`
      truncate table ${schema.eventTypeFolders}, ${schema.eventTypes},
        ${schema.workspaces}, ${schema.users}
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeWorkspace(slug: string) {
    const [workspace] = await db.insert(schema.workspaces)
      .values({ name: slug, slug }).returning();
    if (!workspace) throw new Error("failed to insert workspace fixture");
    return workspace;
  }

  async function makeUser(email: string) {
    const [user] = await db.insert(schema.users)
      .values({ name: "Owner", email }).returning();
    if (!user) throw new Error("failed to insert user fixture");
    return user;
  }

  test("deleting a folder un-groups its event types instead of deleting them", async () => {
    const workspace = await makeWorkspace("folders-delete-acme");
    const owner = await makeUser("folders-delete-owner@example.test");
    const [folder] = await db.insert(schema.eventTypeFolders)
      .values({ workspaceId: workspace.id, name: "Franchise", position: 0 }).returning();
    const [eventType] = await db.insert(schema.eventTypes).values({
      workspaceId: workspace.id,
      ownerUserId: owner.id,
      folderId: folder!.id,
      slug: "kickoff",
      title: "Kickoff",
      durationMinutes: 45,
    }).returning();

    await db.delete(schema.eventTypeFolders).where(eq(schema.eventTypeFolders.id, folder!.id));

    const [survivor] = await db.select().from(schema.eventTypes)
      .where(eq(schema.eventTypes.id, eventType!.id));
    expect(survivor).toBeDefined();
    expect(survivor!.folderId).toBeNull();
  });

  test("folder names collide case-insensitively within a workspace but not across them", async () => {
    const acme = await makeWorkspace("folders-collision-acme");
    const other = await makeWorkspace("folders-collision-other");

    await db.insert(schema.eventTypeFolders)
      .values({ workspaceId: acme.id, name: "Franchise", position: 0 });

    await expect(
      (async () => {
        await db.insert(schema.eventTypeFolders)
          .values({ workspaceId: acme.id, name: "franchise", position: 1 });
      })(),
    ).rejects.toMatchObject({ code: "23505" });

    const [elsewhere] = await db.insert(schema.eventTypeFolders)
      .values({ workspaceId: other.id, name: "Franchise", position: 0 }).returning();
    expect(elsewhere).toBeDefined();
  });

  test("lists folders in position order and rejects a duplicate name", async () => {
    const acme = await makeWorkspace("folders-list-acme");

    const support = await createEventTypeFolder(acme.id, "Support", db);
    const franchise = await createEventTypeFolder(acme.id, "Franchise", db);
    expect(typeof support).toBe("object");
    expect((support as EventTypeFolderRecord).position).toBe(0);
    expect((franchise as EventTypeFolderRecord).position).toBe(1);

    expect(await createEventTypeFolder(acme.id, "franchise", db)).toBe("name_taken");

    const listed = await listEventTypeFolders(acme.id, db);
    expect(listed.map((folder) => folder.name)).toEqual(["Support", "Franchise"]);
  });

  test("event types come back in a deterministic title order", async () => {
    const acme = await makeWorkspace("folders-title-order-acme");
    const owner = await makeUser("folders-title-order-owner@example.test");
    await db.insert(schema.eventTypes).values([
      { workspaceId: acme.id, ownerUserId: owner.id, slug: "zeta", title: "Zeta", durationMinutes: 15 },
      { workspaceId: acme.id, ownerUserId: owner.id, slug: "alpha", title: "Alpha", durationMinutes: 15 },
      { workspaceId: acme.id, ownerUserId: owner.id, slug: "mid", title: "Mid", durationMinutes: 15 },
    ]);

    const rows = await listEventTypesForUser(owner.id, db, acme.id);
    expect(rows.map((row) => row.title)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  test("setEventTypeFolder refuses a folder from another workspace", async () => {
    const acme = await makeWorkspace("folders-foreign-acme");
    const other = await makeWorkspace("folders-foreign-other");
    const owner = await makeUser("folders-foreign-owner@example.test");
    const [eventType] = await db.insert(schema.eventTypes).values({
      workspaceId: acme.id,
      ownerUserId: owner.id,
      slug: "kickoff",
      title: "Kickoff",
      durationMinutes: 45,
    }).returning();
    const foreign = await createEventTypeFolder(other.id, "Franchise", db);

    expect(
      await setEventTypeFolder(
        eventType!.id,
        owner.id,
        (foreign as EventTypeFolderRecord).id,
        db,
        acme.id,
      ),
    ).toBe("folder_not_found");

    const [unchanged] = await db.select().from(schema.eventTypes)
      .where(eq(schema.eventTypes.id, eventType!.id));
    expect(unchanged!.folderId).toBeNull();
  });

  test("renaming and repositioning a folder round trips", async () => {
    const acme = await makeWorkspace("folders-rename-reposition-acme");
    const created = await createEventTypeFolder(acme.id, "Suport", db);
    const id = (created as EventTypeFolderRecord).id;

    const renamed = await updateEventTypeFolder(id, acme.id, { name: "Support" }, db);
    expect((renamed as EventTypeFolderRecord).name).toBe("Support");

    const moved = await updateEventTypeFolder(id, acme.id, { position: 5 }, db);
    expect((moved as EventTypeFolderRecord).position).toBe(5);

    expect(await deleteEventTypeFolder(id, acme.id, db)).toBe("deleted");
    expect(await deleteEventTypeFolder(id, acme.id, db)).toBe("not_found");
  });
});

import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as s from "../../src/db/schema";
import { franchiseOnboardingInput } from "../../src/core/engagement/franchise-onboarding";
import { provisionFranchiseOnboarding } from "../../src/db/franchise-onboarding-repo";
import { prepareOnboardingKickoff } from "../../src/db/prepare-kickoff-repo";
import { createEngagement, removeEngagementPerson, setEngagementPerson } from "../../src/db/engagement-repo";
import { getEngagementSeries, listEngagementSeries } from "../../src/db/engagement-series-repo";
import { listEventTypesForUser } from "../../src/db/admin-repo";

async function fixture() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema: s });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.execute(sql`truncate table ${s.users}, ${s.workspaces} restart identity cascade`);
  const people = await db.insert(s.users).values(Array.from({ length: 9 }, (_, i) => ({ name: `Person ${i}`, email: `series-${i}@example.invalid` }))).returning();
  const ids = people.map((p) => p.id);
  const [workspace] = await db.insert(s.workspaces).values({ name: "Series test", slug: "series-test" }).returning();
  const ws = workspace!.id;
  // Person 8 is not a member of this workspace.
  await db.insert(s.workspaceMembers).values(ids.slice(0, 8).map((userId) => ({ workspaceId: ws, userId, role: "member" as const })));
  const admin = { userId: ids[0]!, workspaceRole: "admin" as const };
  const lead = { userId: ids[2]!, workspaceRole: "member" as const };
  const created = await provisionFranchiseOnboarding(ws, admin, franchiseOnboardingInput.parse({
    sourceWorkspaceId: crypto.randomUUID(), sourceProjectKey: "jacksonville", locationKey: crypto.randomUUID(),
    franchiseeId: "5854883000000000001", businessUnitId: "5854883000000000002", primaryContactId: "5854883000000000003",
    clientName: "Jacksonville Client", locationName: "Jacksonville", franchiseSuccessUserIds: ids.slice(2, 6),
    kaiUserId: ids[0], andrewUserId: ids[1], accountLeadUserId: lead.userId, organizerUserId: lead.userId,
  }), db);
  if (created.kind !== "created") throw new Error("fixture provision");
  return { pool, db, ws, ids, admin, lead, id: created.onboarding.engagementId };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("engagement series and team", () => {
  test("lists onboarding and plain engagements with their owned links, scoped by visibility", async () => {
    const f = await fixture();
    try {
      const kickoff = await prepareOnboardingKickoff(f.ws, f.admin, f.id, f.db);
      if (kickoff.kind !== "created") throw new Error("kickoff");
      const restricted = await createEngagement(f.ws, f.admin, {
        clientName: "Private client", name: "Private retainer", type: "retainer", status: "active",
        visibility: "restricted", accountLeadUserId: f.ids[1]!,
      }, f.db);
      const all = await listEngagementSeries(f.ws, f.admin, {}, f.db);
      expect(all.map((e) => e.name).sort()).toEqual(["Jacksonville onboarding", "Private retainer"].sort());
      const onboarding = all.find((e) => e.id === f.id)!;
      expect(onboarding).toMatchObject({
        onboarding: { sourceProjectKey: "jacksonville", locationName: "Jacksonville", stage: "kickoff" },
        cadence: "biweekly", schedule: null, progress: { held: 0, total: 0, next: null }, canManage: true,
      });
      expect(onboarding.eventTypes).toEqual([{ id: kickoff.eventTypeId, slug: expect.stringMatching(/^onboarding-kickoff-/), title: "Jacksonville kickoff", kind: "kickoff", published: false }]);
      expect(all.find((e) => e.id === restricted.engagement.id)).toMatchObject({ onboarding: null, cadence: null, eventTypes: [] });
      // Both are restricted: a member outside them sees neither; one on the roster sees it without managing it.
      const outsider = { userId: f.ids[7]!, workspaceRole: "member" as const };
      expect(await listEngagementSeries(f.ws, outsider, {}, f.db)).toEqual([]);
      const attendee = await listEngagementSeries(f.ws, { userId: f.ids[3]!, workspaceRole: "member" }, {}, f.db);
      expect(attendee.map((e) => [e.id, e.canManage])).toEqual([[f.id, false]]);
      expect(await getEngagementSeries(f.ws, outsider, restricted.engagement.id, f.db)).toBeNull();
      expect(await getEngagementSeries(f.ws, f.admin, crypto.randomUUID(), f.db)).toBeNull();
      // The organizer event-type list says which engagement a link belongs to.
      const links = await listEventTypesForUser(f.lead.userId, f.db, f.ws);
      expect(links.find((l) => l.id === kickoff.eventTypeId)?.engagementId).toBe(f.id);
    } finally {
      await f.pool.end();
    }
  });

  test("team changes: managers only, members only, never the lead or a meeting attendee", async () => {
    const f = await fixture();
    try {
      const watcher = f.ids[6]!;
      expect((await setEngagementPerson(f.ws, { userId: f.ids[3]!, workspaceRole: "member" }, f.id, { userId: watcher, role: "observer" }, f.db)).kind).toBe("forbidden");
      expect((await setEngagementPerson(f.ws, f.lead, f.id, { userId: f.ids[8]!, role: "observer" }, f.db)).kind).toBe("invalid_engagement_person");
      expect((await setEngagementPerson(f.ws, f.lead, f.id, { userId: f.lead.userId, role: "observer" }, f.db)).kind).toBe("account_lead");
      expect((await setEngagementPerson(crypto.randomUUID(), f.admin, f.id, { userId: watcher, role: "observer" }, f.db)).kind).toBe("not_found");
      const added = await setEngagementPerson(f.ws, f.lead, f.id, { userId: watcher, role: "observer" }, f.db);
      expect(added.kind).toBe("updated");
      const again = await setEngagementPerson(f.ws, f.lead, f.id, { userId: watcher, role: "finance" }, f.db);
      if (again.kind !== "updated") throw new Error(again.kind);
      expect(again.people.filter((p) => p.userId === watcher)).toEqual([{ userId: watcher, name: "Person 6", email: "series-6@example.invalid", role: "finance" }]);
      const series = await getEngagementSeries(f.ws, f.admin, f.id, f.db);
      expect(series?.people.find((p) => p.userId === watcher)).toMatchObject({ role: "finance", attendance: null });

      expect((await removeEngagementPerson(f.ws, f.lead, f.id, f.ids[3]!, f.db)).kind).toBe("meeting_attendee");
      expect((await removeEngagementPerson(f.ws, f.lead, f.id, f.lead.userId, f.db)).kind).toBe("account_lead");
      expect((await removeEngagementPerson(f.ws, { userId: f.ids[7]!, workspaceRole: "member" }, f.id, watcher, f.db)).kind).toBe("not_found");
      expect((await removeEngagementPerson(f.ws, { userId: f.ids[4]!, workspaceRole: "member" }, f.id, watcher, f.db)).kind).toBe("forbidden");
      const removed = await removeEngagementPerson(f.ws, f.admin, f.id, watcher, f.db);
      if (removed.kind !== "removed") throw new Error(removed.kind);
      expect(removed.people.some((p) => p.userId === watcher)).toBe(false);
      expect((await removeEngagementPerson(f.ws, f.admin, f.id, watcher, f.db)).kind).toBe("person_not_found");
    } finally {
      await f.pool.end();
    }
  });
});

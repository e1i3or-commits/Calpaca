import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  addMeetingPollInvitees,
  createMeetingPoll,
  finalizeMeetingPoll,
  getMeetingPollResponse,
  getPublicMeetingPoll,
  listDuePollReminderJobs,
  listMeetingPolls,
  removeMeetingPollInvite,
  resetMeetingPollInvitation,
  saveMeetingPollVotes,
} from "../../src/db/poll-repo";

describe.skipIf(!process.env.TEST_DATABASE_URL)("meeting poll repository", () => {
  test("creates, votes, edits by token, ranks, and finalizes within a workspace", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(sql`
        truncate table ${schema.meetingPollVotes}, ${schema.meetingPollParticipants},
          ${schema.meetingPollOptions}, ${schema.meetingPolls},
          ${schema.workspaceMembers}, ${schema.workspaces}, ${schema.users}
        restart identity cascade
      `);
      const [owner] = await db.insert(schema.users).values({
        name: "Owner",
        email: "owner@poll.test",
      }).returning();
      const [workspace] = await db.insert(schema.workspaces).values({
        name: "Poll workspace",
        slug: "poll-workspace",
        plan: "business",
      }).returning();
      const poll = await createMeetingPoll({
        workspaceId: workspace!.id,
        ownerUserId: owner!.id,
        title: "Planning",
        timezone: "UTC",
        deadline: new Date(Date.now() + 23 * 60 * 60_000),
        reminder24Hours: true,
        inviteeEmails: ["person@example.test", "waiting@example.test"],
        options: [
          { startsAt: new Date("2027-01-10T10:00:00Z"), endsAt: new Date("2027-01-10T11:00:00Z") },
          { startsAt: new Date("2027-01-11T10:00:00Z"), endsAt: new Date("2027-01-11T11:00:00Z") },
        ],
      }, db);

      const first = await saveMeetingPollVotes({
        publicId: poll.publicId,
        name: "Participant",
        email: "person@example.test",
        votes: [
          { optionId: poll.options[0]!.id, choice: "no" },
          { optionId: poll.options[1]!.id, choice: "yes" },
        ],
      }, db);
      expect(typeof first === "object").toBe(true);
      if (typeof first !== "object") throw new Error("vote failed");
      const ownerPoll = (await listMeetingPolls(workspace!.id, db))
        .find((item) => item.id === poll.id);
      expect(ownerPoll?.invites?.map((invite) => invite.email)).toEqual([
        "person@example.test",
        "waiting@example.test",
      ]);
      const waitingInvite = ownerPoll?.invites?.find(
        (invite) => invite.email === "waiting@example.test",
      );
      if (!waitingInvite) throw new Error("waiting invite missing");
      const dueReminders = await listDuePollReminderJobs(new Date(), db);
      expect(dueReminders).toEqual([
        {
          inviteId: waitingInvite.id,
          kind: "reminder_24h",
        },
      ]);
      expect(await resetMeetingPollInvitation(
        poll.id,
        workspace!.id,
        waitingInvite.id,
        db,
      )).toBe("reset");
      expect(await removeMeetingPollInvite(
        poll.id,
        workspace!.id,
        waitingInvite.id,
        db,
      )).toBe(true);
      const withAddedInvite = await addMeetingPollInvitees(
        poll.id,
        workspace!.id,
        ["new@example.test", "person@example.test"],
        db,
      );
      expect(typeof withAddedInvite).toBe("object");
      if (typeof withAddedInvite !== "object") throw new Error("invite add failed");
      expect(withAddedInvite.invites?.map((invite) => invite.email)).toEqual([
        "new@example.test",
        "person@example.test",
      ]);
      expect(withAddedInvite.responses?.map((response) => response.email)).toEqual([
        "person@example.test",
      ]);
      expect(await getMeetingPollResponse(poll.publicId, first.editToken, db))
        .toMatchObject({ name: "Participant", email: "person@example.test" });

      const edited = await saveMeetingPollVotes({
        publicId: poll.publicId,
        name: "Participant",
        email: "person@example.test",
        token: first.editToken,
        votes: [
          { optionId: poll.options[0]!.id, choice: "yes" },
          { optionId: poll.options[1]!.id, choice: "if_needed" },
        ],
      }, db);
      expect(edited).toEqual({ editToken: first.editToken });
      const publicPoll = await getPublicMeetingPoll(poll.publicId, db);
      expect(publicPoll?.options[0]).toMatchObject({
        id: poll.options[0]!.id,
        yes: 1,
      });

      const finalized = await finalizeMeetingPoll(
        poll.id,
        workspace!.id,
        poll.options[0]!.id,
        db,
      );
      expect(typeof finalized === "object" && finalized.status).toBe("finalized");
      expect(await saveMeetingPollVotes({
        publicId: poll.publicId,
        name: "Late",
        email: "late@example.test",
        votes: poll.options.map((option) => ({ optionId: option.id, choice: "yes" })),
      }, db)).toBe("closed");
    } finally {
      await pool.end();
    }
  });
});

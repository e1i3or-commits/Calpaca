import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import {
  meetingPollOptions,
  meetingPollInvites,
  meetingPollParticipants,
  meetingPollVotes,
  meetingPolls,
} from "./schema";
import { rankPollOptions, type PollChoice } from "../core/polls/ranking";

type Db = NodePgDatabase<typeof schema>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const publicToken = () => randomBytes(18).toString("base64url");
const editToken = () => randomBytes(32).toString("base64url");

export type PollOptionInput = { startsAt: Date; endsAt: Date };
export type PollRecord = {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  timezone: string;
  status: string;
  resultsVisibility: string;
  deadline: Date | null;
  allowResponseEditing: boolean;
  participantLimit: number | null;
  reminder24Hours: boolean;
  reminder1Hour: boolean;
  finalizedOptionId: string | null;
  participantCount: number;
  options: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    yes: number;
    ifNeeded: number;
    no: number;
  }[];
  responses?: {
    id: string;
    name: string;
    email: string;
    finalizationStatus: string;
    finalizationSentAt: Date | null;
    finalizationError: string | null;
    votes: { optionId: string; choice: PollChoice }[];
  }[];
  invites?: {
    id: string;
    email: string;
    invitationSentAt: Date | null;
    reminder24SentAt: Date | null;
    reminder1SentAt: Date | null;
    lastError: string | null;
    responded: boolean;
  }[];
};

async function hydratePoll(
  poll: typeof meetingPolls.$inferSelect,
  executor: Db,
  includeParticipants = false,
): Promise<PollRecord> {
  const options = await executor.select().from(meetingPollOptions)
    .where(eq(meetingPollOptions.pollId, poll.id))
    .orderBy(asc(meetingPollOptions.startsAt));
  const participants = await executor.select({
    id: meetingPollParticipants.id,
    name: meetingPollParticipants.name,
    email: meetingPollParticipants.email,
    finalizationStatus: meetingPollParticipants.finalizationStatus,
    finalizationSentAt: meetingPollParticipants.finalizationSentAt,
    finalizationError: meetingPollParticipants.finalizationError,
  })
    .from(meetingPollParticipants)
    .where(eq(meetingPollParticipants.pollId, poll.id));
  const votes = participants.length
    ? await executor.select().from(meetingPollVotes)
        .where(inArray(meetingPollVotes.participantId, participants.map((row) => row.id)))
    : [];
  const invites = includeParticipants
    ? await executor.select().from(meetingPollInvites)
        .where(eq(meetingPollInvites.pollId, poll.id))
        .orderBy(asc(meetingPollInvites.email))
    : [];
  const participantEmails = new Set(participants.map((participant) => participant.email));
  const ranked = rankPollOptions(options.map((option) => {
    const optionVotes = votes.filter((vote) => vote.optionId === option.id);
    return {
      optionId: option.id,
      yes: optionVotes.filter((vote) => vote.choice === "yes").length,
      ifNeeded: optionVotes.filter((vote) => vote.choice === "if_needed").length,
      no: optionVotes.filter((vote) => vote.choice === "no").length,
    };
  }));
  const tally = new Map(ranked.map((item) => [item.optionId, item]));
  return {
    id: poll.id,
    publicId: poll.publicId,
    title: poll.title,
    description: poll.description,
    timezone: poll.timezone,
    status: poll.status,
    resultsVisibility: poll.resultsVisibility,
    deadline: poll.deadline,
    allowResponseEditing: poll.allowResponseEditing,
    participantLimit: poll.participantLimit,
    reminder24Hours: poll.reminder24Hours,
    reminder1Hour: poll.reminder1Hour,
    finalizedOptionId: poll.finalizedOptionId,
    participantCount: participants.length,
    options: ranked.map((item) => {
      const option = options.find((candidate) => candidate.id === item.optionId)!;
      return { ...option, ...tally.get(option.id)! };
    }),
    ...(includeParticipants
      ? {
          responses: participants.map((participant) => ({
            id: participant.id,
            name: participant.name,
            email: participant.email,
            finalizationStatus: participant.finalizationStatus,
            finalizationSentAt: participant.finalizationSentAt,
            finalizationError: participant.finalizationError,
            votes: votes
              .filter((vote) => vote.participantId === participant.id)
              .map((vote) => ({
                optionId: vote.optionId,
                choice: vote.choice as PollChoice,
              })),
          })),
          invites: invites.map((invite) => ({
            id: invite.id,
            email: invite.email,
            invitationSentAt: invite.invitationSentAt,
            reminder24SentAt: invite.reminder24SentAt,
            reminder1SentAt: invite.reminder1SentAt,
            lastError: invite.lastError,
            responded: participantEmails.has(invite.email),
          })),
        }
      : {}),
  };
}

export async function createMeetingPoll(input: {
  workspaceId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  timezone: string;
  resultsVisibility?: "live" | "after_response" | "aggregates" | "hidden";
  deadline?: Date;
  allowResponseEditing?: boolean;
  participantLimit?: number;
  reminder24Hours?: boolean;
  reminder1Hour?: boolean;
  inviteeEmails?: string[];
  options: PollOptionInput[];
}, executor: Db = getDb()): Promise<PollRecord> {
  return executor.transaction(async (tx) => {
    const [poll] = await tx.insert(meetingPolls).values({
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      publicId: publicToken(),
      title: input.title,
      description: input.description ?? null,
      timezone: input.timezone,
      resultsVisibility: input.resultsVisibility ?? "after_response",
      deadline: input.deadline,
      allowResponseEditing: input.allowResponseEditing ?? true,
      participantLimit: input.participantLimit,
      reminder24Hours: input.reminder24Hours ?? false,
      reminder1Hour: input.reminder1Hour ?? false,
    }).returning();
    if (!poll) throw new Error("poll insert returned no row");
    await tx.insert(meetingPollOptions).values(input.options.map((option) => ({
      pollId: poll.id,
      ...option,
    })));
    const inviteeEmails = [...new Set((input.inviteeEmails ?? []).map((email) => email.toLowerCase()))];
    if (inviteeEmails.length > 0) {
      await tx.insert(meetingPollInvites).values(inviteeEmails.map((email) => ({
        pollId: poll.id,
        email,
      })));
    }
    return hydratePoll(poll, tx);
  });
}

export type PollInviteKind = "invitation" | "reminder_24h" | "reminder_1h";

export async function listUnsentPollInviteIds(
  pollId: string,
  executor: Db = getDb(),
): Promise<string[]> {
  const rows = await executor.select({ id: meetingPollInvites.id })
    .from(meetingPollInvites)
    .where(and(
      eq(meetingPollInvites.pollId, pollId),
      isNull(meetingPollInvites.invitationSentAt),
    ));
  return rows.map((row) => row.id);
}

export async function listDuePollReminderJobs(
  now: Date,
  executor: Db = getDb(),
): Promise<{ inviteId: string; kind: "reminder_24h" | "reminder_1h" }[]> {
  const polls = await executor.select({
    id: meetingPolls.id,
    deadline: meetingPolls.deadline,
    reminder24Hours: meetingPolls.reminder24Hours,
    reminder1Hour: meetingPolls.reminder1Hour,
  }).from(meetingPolls).where(and(
    eq(meetingPolls.status, "open"),
    isNotNull(meetingPolls.deadline),
  ));
  const jobs: { inviteId: string; kind: "reminder_24h" | "reminder_1h" }[] = [];
  for (const poll of polls) {
    if (!poll.deadline) continue;
    const remainingMs = poll.deadline.getTime() - now.getTime();
    if (remainingMs <= 0 || remainingMs > 24 * 60 * 60_000) continue;
    const invites = await executor.select().from(meetingPollInvites)
      .where(eq(meetingPollInvites.pollId, poll.id));
    const participants = await executor.select({ email: meetingPollParticipants.email })
      .from(meetingPollParticipants)
      .where(eq(meetingPollParticipants.pollId, poll.id));
    const responded = new Set(participants.map((participant) => participant.email));
    for (const invite of invites) {
      if (responded.has(invite.email)) continue;
      if (remainingMs <= 60 * 60_000) {
        if (poll.reminder1Hour && invite.reminder1SentAt === null) {
          jobs.push({ inviteId: invite.id, kind: "reminder_1h" });
        }
      } else if (poll.reminder24Hours && invite.reminder24SentAt === null) {
        jobs.push({ inviteId: invite.id, kind: "reminder_24h" });
      }
    }
  }
  return jobs;
}

export async function getPollInviteContext(
  inviteId: string,
  kind: PollInviteKind,
  executor: Db = getDb(),
): Promise<{
  inviteId: string;
  email: string;
  title: string;
  publicId: string;
  deadline: Date | null;
  timezone: string;
} | null> {
  const [row] = await executor.select({
    inviteId: meetingPollInvites.id,
    email: meetingPollInvites.email,
    invitationSentAt: meetingPollInvites.invitationSentAt,
    reminder24SentAt: meetingPollInvites.reminder24SentAt,
    reminder1SentAt: meetingPollInvites.reminder1SentAt,
    pollId: meetingPolls.id,
    title: meetingPolls.title,
    publicId: meetingPolls.publicId,
    deadline: meetingPolls.deadline,
    timezone: meetingPolls.timezone,
    status: meetingPolls.status,
  }).from(meetingPollInvites)
    .innerJoin(meetingPolls, eq(meetingPollInvites.pollId, meetingPolls.id))
    .where(eq(meetingPollInvites.id, inviteId));
  if (
    !row
    || row.status !== "open"
    || (row.deadline && row.deadline.getTime() <= Date.now())
  ) return null;
  const alreadySent = kind === "invitation"
    ? row.invitationSentAt
    : kind === "reminder_24h"
      ? row.reminder24SentAt
      : row.reminder1SentAt;
  if (alreadySent) return null;
  if (kind !== "invitation") {
    const [response] = await executor.select({ id: meetingPollParticipants.id })
      .from(meetingPollParticipants)
      .where(and(
        eq(meetingPollParticipants.pollId, row.pollId),
        eq(meetingPollParticipants.email, row.email),
      ));
    if (response || !row.deadline) return null;
  }
  return {
    inviteId: row.inviteId,
    email: row.email,
    title: row.title,
    publicId: row.publicId,
    deadline: row.deadline,
    timezone: row.timezone,
  };
}

export async function recordPollInviteDelivery(
  inviteId: string,
  kind: PollInviteKind,
  outcome: { sent: true } | { sent: false; error: string },
  executor: Db = getDb(),
): Promise<void> {
  const sentField = kind === "invitation"
    ? { invitationSentAt: new Date() }
    : kind === "reminder_24h"
      ? { reminder24SentAt: new Date() }
      : { reminder1SentAt: new Date() };
  await executor.update(meetingPollInvites).set(outcome.sent
    ? { ...sentField, lastError: null }
    : { lastError: outcome.error.slice(0, 1000) })
    .where(eq(meetingPollInvites.id, inviteId));
}

export async function listMeetingPolls(
  workspaceId: string,
  executor: Db = getDb(),
): Promise<PollRecord[]> {
  const polls = await executor.select().from(meetingPolls)
    .where(eq(meetingPolls.workspaceId, workspaceId))
    .orderBy(desc(meetingPolls.createdAt));
  return Promise.all(polls.map((poll) => hydratePoll(poll, executor, true)));
}

export async function getMeetingPollForOwner(
  id: string,
  workspaceId: string,
  executor: Db = getDb(),
): Promise<PollRecord | null> {
  const [poll] = await executor.select().from(meetingPolls).where(and(
    eq(meetingPolls.id, id),
    eq(meetingPolls.workspaceId, workspaceId),
  ));
  return poll ? hydratePoll(poll, executor, true) : null;
}

export async function getPublicMeetingPoll(
  publicId: string,
  executor: Db = getDb(),
): Promise<PollRecord | null> {
  const [poll] = await executor.select().from(meetingPolls)
    .where(eq(meetingPolls.publicId, publicId));
  return poll ? hydratePoll(poll, executor, true) : null;
}

export async function getMeetingPollWorkspaceId(
  publicId: string,
  executor: Db = getDb(),
): Promise<string | null> {
  const [poll] = await executor.select({ workspaceId: meetingPolls.workspaceId })
    .from(meetingPolls)
    .where(eq(meetingPolls.publicId, publicId));
  return poll?.workspaceId ?? null;
}

export async function saveMeetingPollVotes(input: {
  publicId: string;
  name: string;
  email: string;
  votes: { optionId: string; choice: PollChoice }[];
  token?: string;
}, executor: Db = getDb()): Promise<{ editToken: string } | "not_found" | "closed" | "email_exists" | "invalid_options" | "invalid_token" | "editing_disabled" | "participant_limit_reached"> {
  return executor.transaction(async (tx) => {
    const [poll] = await tx.select().from(meetingPolls)
      .where(eq(meetingPolls.publicId, input.publicId))
      .for("update");
    if (!poll) return "not_found";
    if (
      poll.status !== "open"
      || (poll.deadline !== null && poll.deadline.getTime() <= Date.now())
    ) return "closed";
    const options = await tx.select({ id: meetingPollOptions.id }).from(meetingPollOptions)
      .where(eq(meetingPollOptions.pollId, poll.id));
    const allowed = new Set(options.map((option) => option.id));
    if (
      input.votes.length !== options.length
      || new Set(input.votes.map((vote) => vote.optionId)).size !== options.length
      || input.votes.some((vote) => !allowed.has(vote.optionId))
    ) {
      return "invalid_options";
    }

    let participantId: string;
    let rawToken = input.token;
    if (rawToken) {
      if (!poll.allowResponseEditing) return "editing_disabled";
      const [participant] = await tx.select({ id: meetingPollParticipants.id })
        .from(meetingPollParticipants)
        .where(and(
          eq(meetingPollParticipants.pollId, poll.id),
          eq(meetingPollParticipants.editTokenHash, hash(rawToken)),
        ));
      if (!participant) return "invalid_token";
      participantId = participant.id;
      await tx.update(meetingPollParticipants).set({
        name: input.name,
        email: input.email.toLowerCase(),
        updatedAt: new Date(),
      }).where(eq(meetingPollParticipants.id, participantId));
    } else {
      const [existing] = await tx.select({ id: meetingPollParticipants.id })
        .from(meetingPollParticipants)
        .where(and(
          eq(meetingPollParticipants.pollId, poll.id),
          eq(meetingPollParticipants.email, input.email.toLowerCase()),
        ));
      if (existing) return "email_exists";
      if (poll.participantLimit !== null) {
        const participants = await tx.select({ id: meetingPollParticipants.id })
          .from(meetingPollParticipants)
          .where(eq(meetingPollParticipants.pollId, poll.id));
        if (participants.length >= poll.participantLimit) return "participant_limit_reached";
      }
      rawToken = editToken();
      const [participant] = await tx.insert(meetingPollParticipants).values({
        pollId: poll.id,
        name: input.name,
        email: input.email.toLowerCase(),
        editTokenHash: hash(rawToken),
      }).returning({ id: meetingPollParticipants.id });
      participantId = participant!.id;
    }
    await tx.delete(meetingPollVotes)
      .where(eq(meetingPollVotes.participantId, participantId));
    await tx.insert(meetingPollVotes).values(input.votes.map((vote) => ({
      participantId,
      optionId: vote.optionId,
      choice: vote.choice,
    })));
    return { editToken: rawToken };
  });
}

export async function setMeetingPollOpenState(
  id: string,
  workspaceId: string,
  open: boolean,
  executor: Db = getDb(),
): Promise<PollRecord | "not_found" | "finalized" | "deadline_passed"> {
  const [poll] = await executor.select().from(meetingPolls).where(and(
    eq(meetingPolls.id, id),
    eq(meetingPolls.workspaceId, workspaceId),
  ));
  if (!poll) return "not_found";
  if (poll.status === "finalized") return "finalized";
  if (open && poll.deadline !== null && poll.deadline.getTime() <= Date.now()) {
    return "deadline_passed";
  }
  const [updated] = await executor.update(meetingPolls).set({
    status: open ? "open" : "closed",
    updatedAt: new Date(),
  }).where(eq(meetingPolls.id, poll.id)).returning();
  return hydratePoll(updated!, executor, true);
}

export async function getMeetingPollResponse(
  publicId: string,
  token: string,
  executor: Db = getDb(),
) {
  const [poll] = await executor.select({ id: meetingPolls.id }).from(meetingPolls)
    .where(eq(meetingPolls.publicId, publicId));
  if (!poll) return null;
  const [participant] = await executor.select().from(meetingPollParticipants).where(and(
    eq(meetingPollParticipants.pollId, poll.id),
    eq(meetingPollParticipants.editTokenHash, hash(token)),
  ));
  if (!participant) return null;
  const votes = await executor.select({
    optionId: meetingPollVotes.optionId,
    choice: meetingPollVotes.choice,
  }).from(meetingPollVotes).where(eq(meetingPollVotes.participantId, participant.id));
  return { name: participant.name, email: participant.email, votes };
}

export async function finalizeMeetingPoll(
  id: string,
  workspaceId: string,
  optionId: string,
  executor: Db = getDb(),
): Promise<PollRecord | "not_found" | "closed" | "invalid_option"> {
  return executor.transaction(async (tx) => {
    const [poll] = await tx.select().from(meetingPolls).where(and(
      eq(meetingPolls.id, id),
      eq(meetingPolls.workspaceId, workspaceId),
    ));
    if (!poll) return "not_found";
    if (poll.status !== "open") return "closed";
    const [option] = await tx.select({ id: meetingPollOptions.id }).from(meetingPollOptions)
      .where(and(
        eq(meetingPollOptions.id, optionId),
        eq(meetingPollOptions.pollId, poll.id),
      ));
    if (!option) return "invalid_option";
    const [updated] = await tx.update(meetingPolls).set({
      status: "finalized",
      finalizedOptionId: optionId,
      updatedAt: new Date(),
    }).where(eq(meetingPolls.id, poll.id)).returning();
    await tx.update(meetingPollParticipants).set({
      finalizationStatus: "pending",
      finalizationSentAt: null,
      finalizationError: null,
    }).where(eq(meetingPollParticipants.pollId, poll.id));
    return hydratePoll(updated!, tx);
  });
}

export type PollFinalizationContext = {
  poll: {
    id: string;
    publicId: string;
    title: string;
    description: string | null;
    timezone: string;
  };
  owner: { name: string; email: string };
  option: { startsAt: Date; endsAt: Date };
  participants: {
    id: string;
    name: string;
    email: string;
    choice: PollChoice;
    status: string;
  }[];
};

export async function getPollFinalizationContext(
  pollId: string,
  executor: Db = getDb(),
): Promise<PollFinalizationContext | null> {
  const [row] = await executor.select({
    id: meetingPolls.id,
    publicId: meetingPolls.publicId,
    title: meetingPolls.title,
    description: meetingPolls.description,
    timezone: meetingPolls.timezone,
    finalizedOptionId: meetingPolls.finalizedOptionId,
    ownerName: schema.users.name,
    ownerEmail: schema.users.email,
  }).from(meetingPolls)
    .innerJoin(schema.users, eq(meetingPolls.ownerUserId, schema.users.id))
    .where(eq(meetingPolls.id, pollId));
  if (!row?.finalizedOptionId) return null;
  const [option] = await executor.select({
    startsAt: meetingPollOptions.startsAt,
    endsAt: meetingPollOptions.endsAt,
  }).from(meetingPollOptions).where(and(
    eq(meetingPollOptions.id, row.finalizedOptionId),
    eq(meetingPollOptions.pollId, row.id),
  ));
  if (!option) return null;
  const participants = await executor.select({
    id: meetingPollParticipants.id,
    name: meetingPollParticipants.name,
    email: meetingPollParticipants.email,
    choice: meetingPollVotes.choice,
    status: meetingPollParticipants.finalizationStatus,
  }).from(meetingPollParticipants)
    .innerJoin(meetingPollVotes, and(
      eq(meetingPollVotes.participantId, meetingPollParticipants.id),
      eq(meetingPollVotes.optionId, row.finalizedOptionId),
    ))
    .where(eq(meetingPollParticipants.pollId, row.id));
  return {
    poll: {
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      description: row.description,
      timezone: row.timezone,
    },
    owner: { name: row.ownerName, email: row.ownerEmail },
    option,
    participants: participants.map((participant) => ({
      ...participant,
      choice: participant.choice as PollChoice,
    })),
  };
}

export async function recordPollFinalizationDelivery(
  participantId: string,
  outcome: { sent: true } | { sent: false; error: string },
  executor: Db = getDb(),
): Promise<void> {
  await executor.update(meetingPollParticipants).set(outcome.sent
    ? {
        finalizationStatus: "sent",
        finalizationSentAt: new Date(),
        finalizationError: null,
      }
    : {
        finalizationStatus: "failed",
        finalizationError: outcome.error.slice(0, 1000),
      })
    .where(eq(meetingPollParticipants.id, participantId));
}

export async function resetPollFinalizationDelivery(
  pollId: string,
  workspaceId: string,
  participantId: string,
  executor: Db = getDb(),
): Promise<boolean> {
  const [row] = await executor.select({ id: meetingPollParticipants.id })
    .from(meetingPollParticipants)
    .innerJoin(meetingPolls, eq(meetingPollParticipants.pollId, meetingPolls.id))
    .where(and(
      eq(meetingPollParticipants.id, participantId),
      eq(meetingPolls.id, pollId),
      eq(meetingPolls.workspaceId, workspaceId),
      eq(meetingPolls.status, "finalized"),
    ));
  if (!row) return false;
  await executor.update(meetingPollParticipants).set({
    finalizationStatus: "pending",
    finalizationError: null,
  }).where(eq(meetingPollParticipants.id, participantId));
  return true;
}

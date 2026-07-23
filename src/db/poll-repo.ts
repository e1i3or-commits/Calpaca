import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import {
  meetingPollOptions,
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
    name: string;
    email: string;
    votes: { optionId: string; choice: PollChoice }[];
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
  })
    .from(meetingPollParticipants)
    .where(eq(meetingPollParticipants.pollId, poll.id));
  const votes = participants.length
    ? await executor.select().from(meetingPollVotes)
        .where(inArray(meetingPollVotes.participantId, participants.map((row) => row.id)))
    : [];
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
    finalizedOptionId: poll.finalizedOptionId,
    participantCount: participants.length,
    options: ranked.map((item) => {
      const option = options.find((candidate) => candidate.id === item.optionId)!;
      return { ...option, ...tally.get(option.id)! };
    }),
    ...(includeParticipants
      ? {
          responses: participants.map((participant) => ({
            name: participant.name,
            email: participant.email,
            votes: votes
              .filter((vote) => vote.participantId === participant.id)
              .map((vote) => ({
                optionId: vote.optionId,
                choice: vote.choice as PollChoice,
              })),
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
    }).returning();
    if (!poll) throw new Error("poll insert returned no row");
    await tx.insert(meetingPollOptions).values(input.options.map((option) => ({
      pollId: poll.id,
      ...option,
    })));
    return hydratePoll(poll, tx);
  });
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
}, executor: Db = getDb()): Promise<{ editToken: string } | "not_found" | "closed" | "email_exists" | "invalid_options" | "invalid_token"> {
  return executor.transaction(async (tx) => {
    const [poll] = await tx.select().from(meetingPolls)
      .where(eq(meetingPolls.publicId, input.publicId));
    if (!poll) return "not_found";
    if (poll.status !== "open") return "closed";
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
    return hydratePoll(updated!, tx);
  });
}

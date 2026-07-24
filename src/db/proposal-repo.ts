import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EngagementActor } from "../core/engagement/permissions";
import { isAllowedDuration } from "../core/booking/durations";
import {
  canEditProposal,
  effectiveProposalStatus,
  transitionProposal,
  type ProposalAction,
  type ProposalStatus,
} from "../core/proposals/state";
import { generateToken } from "../lib/id";
import { getDb } from "./client";
import { getEngagement } from "./engagement-repo";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;
type ProposalRow = typeof schema.proposals.$inferSelect;

export type ProposalInput = {
  eventTypeId: string;
  title: string;
  message: string | null;
  recipientName: string;
  recipientEmail: string;
  expiresAt: Date;
  options: schema.ProposalOption[];
};

async function validOptions(
  eventTypeId: string,
  input: ProposalInput,
  executor: Db,
) {
  const [eventType] = await executor
    .select({
      durationMinutes: schema.eventTypes.durationMinutes,
      selectableDurations: schema.eventTypes.selectableDurations,
    })
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.id, eventTypeId));
  const hosts = await executor
    .select({ userId: schema.eventTypeHosts.userId })
    .from(schema.eventTypeHosts)
    .where(eq(schema.eventTypeHosts.eventTypeId, eventTypeId));
  const configuredHosts = new Set(hosts.map((host) => host.userId));
  return Boolean(eventType) && input.options.every((option) => {
    const start = new Date(option.start);
    const end = new Date(option.end);
    const duration = (end.getTime() - start.getTime()) / 60_000;
    return Number.isFinite(start.getTime())
      && Number.isFinite(end.getTime())
      && end > start
      && isAllowedDuration(
        duration,
        eventType!.durationMinutes,
        eventType!.selectableDurations,
      )
      && option.hostUserIds.length > 0
      && option.hostUserIds.every((hostId) => configuredHosts.has(hostId));
  });
}

function serialize(row: ProposalRow, now = new Date()) {
  return {
    ...row,
    status: effectiveProposalStatus(row.status, row.expiresAt, now),
  };
}

async function scopedProposal(
  workspaceId: string,
  actor: EngagementActor,
  proposalId: string,
  executor: Db,
) {
  const [proposal] = await executor
    .select()
    .from(schema.proposals)
    .where(and(
      eq(schema.proposals.id, proposalId),
      eq(schema.proposals.workspaceId, workspaceId),
    ));
  if (!proposal) return null;
  const engagement = await getEngagement(
    workspaceId,
    actor,
    proposal.engagementId,
    executor,
  );
  return engagement ? { proposal, engagement } : null;
}

export async function listEngagementProposals(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement) return null;
  const rows = await executor
    .select()
    .from(schema.proposals)
    .where(and(
      eq(schema.proposals.workspaceId, workspaceId),
      eq(schema.proposals.engagementId, engagementId),
    ))
    .orderBy(desc(schema.proposals.createdAt));
  return {
    proposals: rows.map((row) => serialize(row)),
    canManage: engagement.canManage,
  };
}

export async function getProposal(
  workspaceId: string,
  actor: EngagementActor,
  proposalId: string,
  executor: Db = getDb(),
) {
  const scoped = await scopedProposal(workspaceId, actor, proposalId, executor);
  if (!scoped) return null;
  const [eventType] = await executor
    .select({
      title: schema.eventTypes.title,
      purpose: schema.eventTypes.purpose,
      preparationItems: schema.eventTypes.preparationItems,
    })
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.id, scoped.proposal.eventTypeId));
  const activity = await executor
    .select()
    .from(schema.proposalEvents)
    .where(eq(schema.proposalEvents.proposalId, scoped.proposal.id))
    .orderBy(asc(schema.proposalEvents.createdAt));
  return {
    proposal: serialize(scoped.proposal),
    engagement: {
      id: scoped.engagement.id,
      name: scoped.engagement.name,
      clientName: scoped.engagement.clientName,
    },
    conversation: eventType ?? null,
    activity,
    canManage: scoped.engagement.canManage,
  };
}

export async function createProposal(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  input: ProposalInput,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement) return { kind: "not_found" as const };
  if (!engagement.canManage) return { kind: "forbidden" as const };
  const [eventType] = await executor
    .select({ id: schema.eventTypes.id, status: schema.eventTypes.playbookStatus })
    .from(schema.eventTypes)
    .where(and(
      eq(schema.eventTypes.id, input.eventTypeId),
      eq(schema.eventTypes.workspaceId, workspaceId),
      eq(schema.eventTypes.engagementId, engagementId),
    ));
  if (!eventType) return { kind: "conversation_not_found" as const };
  if (eventType.status !== "ready") return { kind: "conversation_not_ready" as const };
  if (!await validOptions(eventType.id, input, executor)) {
    return { kind: "invalid_options" as const };
  }
  const [proposal] = await executor
    .insert(schema.proposals)
    .values({
      workspaceId,
      engagementId,
      ownerUserId: actor.userId,
      publicId: generateToken(),
      ...input,
      status: "draft",
    })
    .returning();
  if (!proposal) throw new Error("proposal insert returned no row");
  await executor.insert(schema.proposalEvents).values({
    proposalId: proposal.id,
    kind: "created",
    actorType: "organizer",
    detail: { actorUserId: actor.userId },
  });
  return { kind: "created" as const, proposal: serialize(proposal) };
}

export async function updateProposal(
  workspaceId: string,
  actor: EngagementActor,
  proposalId: string,
  input: ProposalInput,
  executor: Db = getDb(),
) {
  const scoped = await scopedProposal(workspaceId, actor, proposalId, executor);
  if (!scoped) return { kind: "not_found" as const };
  if (!scoped.engagement.canManage) return { kind: "forbidden" as const };
  if (!canEditProposal(scoped.proposal.status)) {
    return { kind: "invalid_transition" as const };
  }
  if (
    input.eventTypeId !== scoped.proposal.eventTypeId
    || scoped.proposal.engagementId !== scoped.engagement.id
  ) return { kind: "conversation_not_found" as const };
  if (!await validOptions(input.eventTypeId, input, executor)) {
    return { kind: "invalid_options" as const };
  }
  const [proposal] = await executor
    .update(schema.proposals)
    .set({ ...input, status: "draft", updatedAt: new Date() })
    .where(eq(schema.proposals.id, proposalId))
    .returning();
  await executor.insert(schema.proposalEvents).values({
    proposalId,
    kind: "draft_updated",
    actorType: "organizer",
    detail: { actorUserId: actor.userId },
  });
  return { kind: "updated" as const, proposal: serialize(proposal!) };
}

export async function transitionStoredProposal(
  workspaceId: string,
  actor: EngagementActor,
  proposalId: string,
  action: ProposalAction,
  executor: Db = getDb(),
) {
  const scoped = await scopedProposal(workspaceId, actor, proposalId, executor);
  if (!scoped) return { kind: "not_found" as const };
  if (!scoped.engagement.canManage) return { kind: "forbidden" as const };
  const current = effectiveProposalStatus(
    scoped.proposal.status,
    scoped.proposal.expiresAt,
  );
  const effectiveAction = action === "mark_ready"
    && scoped.proposal.options.some((option) =>
      option.recommendation.confidence === "needs_confirmation"
    )
    ? "request_confirmation"
    : action;
  const next = transitionProposal(current, effectiveAction);
  if (!next) return { kind: "invalid_transition" as const };
  if (action === "send" && scoped.proposal.expiresAt <= new Date()) {
    return { kind: "not_ready" as const, issues: ["expiresAt"] };
  }
  if (action === "mark_ready" && scoped.proposal.options.length < 2) {
    return { kind: "not_ready" as const, issues: ["options"] };
  }
  const [proposal] = await executor
    .update(schema.proposals)
    .set({
      status: next,
      ...(action === "send" ? { sentAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(schema.proposals.id, proposalId),
      eq(schema.proposals.status, scoped.proposal.status),
    ))
    .returning();
  if (proposal) {
    await executor.insert(schema.proposalEvents).values({
      proposalId,
      kind: effectiveAction,
      actorType: "organizer",
      detail: { actorUserId: actor.userId, status: next },
    });
  }
  return proposal
    ? { kind: "updated" as const, proposal: serialize(proposal) }
    : { kind: "invalid_transition" as const };
}

export async function getPublicProposal(
  publicId: string,
  executor: Db = getDb(),
) {
  const [row] = await executor
    .select({
      proposal: schema.proposals,
      engagementName: schema.engagements.name,
      clientName: schema.clients.name,
      conversationTitle: schema.eventTypes.title,
      purpose: schema.eventTypes.description,
      preparationItems: schema.eventTypes.preparationItems,
      workspaceName: schema.workspaces.name,
      workspaceSlug: schema.workspaces.slug,
      eventTypeSlug: schema.eventTypes.slug,
    })
    .from(schema.proposals)
    .innerJoin(schema.engagements, eq(schema.engagements.id, schema.proposals.engagementId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.engagements.clientId))
    .innerJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.proposals.eventTypeId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.proposals.workspaceId))
    .where(eq(schema.proposals.publicId, publicId));
  if (!row) return null;
  const hostIds = [...new Set(row.proposal.options.flatMap((option) => option.hostUserIds))];
  const participants = hostIds.length
    ? await executor
        .select({
          id: schema.users.id,
          name: schema.users.name,
          role: schema.eventTypeHosts.role,
        })
        .from(schema.eventTypeHosts)
        .innerJoin(schema.users, eq(schema.users.id, schema.eventTypeHosts.userId))
        .where(eq(schema.eventTypeHosts.eventTypeId, row.proposal.eventTypeId))
    : [];
  return {
    ...serialize(row.proposal),
    engagementName: row.engagementName,
    clientName: row.clientName,
    conversationTitle: row.conversationTitle,
    purpose: row.purpose,
    preparationItems: row.preparationItems,
    workspaceName: row.workspaceName,
    workspaceSlug: row.workspaceSlug,
    eventTypeSlug: row.eventTypeSlug,
    participants: participants.filter((participant) => hostIds.includes(participant.id)),
  };
}

export async function requestProposalAlternative(
  publicId: string,
  request: string,
  executor: Db = getDb(),
) {
  const [proposal] = await executor
    .update(schema.proposals)
    .set({ alternativeRequest: request, updatedAt: new Date() })
    .where(and(
      eq(schema.proposals.publicId, publicId),
      eq(schema.proposals.status, "awaiting_client"),
      gt(schema.proposals.expiresAt, new Date()),
    ))
    .returning();
  if (proposal) {
    await executor.insert(schema.proposalEvents).values({
      proposalId: proposal.id,
      kind: "alternative_requested",
      actorType: "client",
      detail: {},
    });
  }
  return proposal ? serialize(proposal) : null;
}

export function publicProposalStatus(
  status: ProposalStatus,
  expiresAt: Date,
): ProposalStatus {
  return effectiveProposalStatus(status, expiresAt);
}

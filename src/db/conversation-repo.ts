import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  playbookReadiness,
  type PlaybookStatus,
} from "../core/engagement/playbook";
import type { EngagementActor } from "../core/engagement/permissions";
import { getEventTypeForAdmin } from "./admin-repo";
import { getDb } from "./client";
import { getEngagement } from "./engagement-repo";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export type ConversationPlaybookInput = {
  title: string;
  purpose: string | null;
  clientExplanation: string | null;
  durationMinutes: number;
  selectableDurations: number[];
  participantRoles: { role: string; required: boolean }[];
  preparationItems: { label: string; required: boolean }[];
  outcomeDefinition: string | null;
  status: PlaybookStatus;
};

async function hostsFor(eventTypeId: string, executor: Db) {
  return executor
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.eventTypeHosts.role,
    })
    .from(schema.eventTypeHosts)
    .innerJoin(schema.users, eq(schema.users.id, schema.eventTypeHosts.userId))
    .where(eq(schema.eventTypeHosts.eventTypeId, eventTypeId));
}

function toPlaybook(
  row: typeof schema.eventTypes.$inferSelect,
  hosts: Awaited<ReturnType<typeof hostsFor>>,
) {
  return {
    id: row.id,
    engagementId: row.engagementId,
    title: row.title,
    slug: row.slug,
    purpose: row.purpose,
    clientExplanation: row.description,
    durationMinutes: row.durationMinutes,
    selectableDurations: row.selectableDurations,
    participantRoles: row.participantRoles,
    preparationItems: row.preparationItems,
    outcomeDefinition: row.outcomeDefinition,
    status: row.playbookStatus,
    scheduleId: row.scheduleId,
    hosts,
    readiness: playbookReadiness({
      purpose: row.purpose,
      participantRoles: row.participantRoles,
      preparationItems: row.preparationItems,
      outcomeDefinition: row.outcomeDefinition,
      durationMinutes: row.durationMinutes,
      scheduleId: row.scheduleId,
      hostCount: hosts.length,
    }),
  };
}

async function loadEventType(
  workspaceId: string,
  eventTypeId: string,
  executor: Db,
) {
  const [row] = await executor
    .select()
    .from(schema.eventTypes)
    .where(and(
      eq(schema.eventTypes.workspaceId, workspaceId),
      eq(schema.eventTypes.id, eventTypeId),
    ));
  return row ?? null;
}

export async function listEngagementConversations(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement) return null;
  const rows = await executor
    .select()
    .from(schema.eventTypes)
    .where(and(
      eq(schema.eventTypes.workspaceId, workspaceId),
      eq(schema.eventTypes.engagementId, engagementId),
    ))
    .orderBy(asc(schema.eventTypes.title));
  return Promise.all(rows.map(async (row) => toPlaybook(row, await hostsFor(row.id, executor))));
}

export async function getConversationPlaybook(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  eventTypeId: string,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement) return null;
  const row = await loadEventType(workspaceId, eventTypeId, executor);
  if (!row || row.engagementId !== engagementId) return null;
  return {
    playbook: toPlaybook(row, await hostsFor(row.id, executor)),
    canManage: engagement.canManage,
  };
}

export async function listWorkspacePlaybooks(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement?.canManage) return null;
  const rows = await executor
    .select()
    .from(schema.eventTypes)
    .where(and(
      eq(schema.eventTypes.workspaceId, workspaceId),
      sql`${schema.eventTypes.engagementId} is null`,
    ))
    .orderBy(asc(schema.eventTypes.title));
  const manageable = [];
  for (const row of rows) {
    if (await getEventTypeForAdmin(row.id, actor.userId, executor, workspaceId)) {
      manageable.push(toPlaybook(row, await hostsFor(row.id, executor)));
    }
  }
  return manageable;
}

export async function listConversationSchedulingOptions(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement?.canManage) return null;
  const userIds = engagement.people.map((person) => person.userId);
  if (userIds.length === 0) return [];
  return executor
    .select({
      id: schema.schedules.id,
      userId: schema.schedules.userId,
      name: schema.schedules.name,
      timezone: schema.schedules.timezone,
    })
    .from(schema.schedules)
    .innerJoin(schema.workspaceMembers, and(
      eq(schema.workspaceMembers.userId, schema.schedules.userId),
      eq(schema.workspaceMembers.workspaceId, workspaceId),
      eq(schema.workspaceMembers.status, "active"),
    ))
    .where(inArray(schema.schedules.userId, userIds))
    .orderBy(asc(schema.schedules.name));
}

export async function attachConversationPlaybook(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  eventTypeId: string,
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement) return "engagement_not_found" as const;
  if (!engagement.canManage) return "forbidden" as const;
  const manageable = await getEventTypeForAdmin(
    eventTypeId,
    actor.userId,
    executor,
    workspaceId,
  );
  if (!manageable) return "playbook_not_found" as const;
  const row = await loadEventType(workspaceId, eventTypeId, executor);
  if (!row || row.engagementId) return "playbook_not_available" as const;
  return executor.transaction(async (tx) => {
    const [copy] = await tx
      .insert(schema.eventTypes)
      .values({
        ...row,
        id: undefined,
        engagementId,
        slug: await nextSlug(workspaceId, row.title, tx),
      })
      .returning({ id: schema.eventTypes.id });
    const hosts = await tx
      .select({
        userId: schema.eventTypeHosts.userId,
        role: schema.eventTypeHosts.role,
        weight: schema.eventTypeHosts.weight,
      })
      .from(schema.eventTypeHosts)
      .where(eq(schema.eventTypeHosts.eventTypeId, eventTypeId));
    if (hosts.length > 0) {
      await tx.insert(schema.eventTypeHosts).values(
        hosts.map((host) => ({ ...host, eventTypeId: copy!.id })),
      );
    }
    return "attached" as const;
  });
}

async function nextSlug(
  workspaceId: string,
  title: string,
  executor: Db,
) {
  const base = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "conversation";
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const [existing] = await executor
      .select({ id: schema.eventTypes.id })
      .from(schema.eventTypes)
      .where(and(
        eq(schema.eventTypes.workspaceId, workspaceId),
        eq(schema.eventTypes.slug, candidate),
      ));
    if (!existing) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createConversationPlaybook(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  input: ConversationPlaybookInput & {
    hostUserId: string;
    scheduleId: string | null;
  },
  executor: Db = getDb(),
) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!engagement) return { kind: "engagement_not_found" as const };
  if (!engagement.canManage) return { kind: "forbidden" as const };
  const [host] = await executor
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(and(
      eq(schema.workspaceMembers.workspaceId, workspaceId),
      eq(schema.workspaceMembers.userId, input.hostUserId),
      eq(schema.workspaceMembers.status, "active"),
    ));
  if (!host) return { kind: "invalid_host" as const };
  if (input.scheduleId) {
    const [schedule] = await executor
      .select({ id: schema.schedules.id })
      .from(schema.schedules)
      .where(and(
        eq(schema.schedules.id, input.scheduleId),
        eq(schema.schedules.userId, input.hostUserId),
      ));
    if (!schedule) return { kind: "invalid_schedule" as const };
  }
  const readiness = playbookReadiness({
    purpose: input.purpose,
    participantRoles: input.participantRoles,
    preparationItems: input.preparationItems,
    outcomeDefinition: input.outcomeDefinition,
    durationMinutes: input.durationMinutes,
    scheduleId: input.scheduleId,
    hostCount: 1,
  });
  if (input.status === "ready" && !readiness.ready) {
    return { kind: "not_ready" as const, issues: readiness.issues };
  }
  return executor.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.eventTypes)
      .values({
        workspaceId,
        engagementId,
        ownerUserId: actor.userId,
        slug: await nextSlug(workspaceId, input.title, tx),
        title: input.title.trim(),
        description: input.clientExplanation,
        durationMinutes: input.durationMinutes,
        selectableDurations: input.selectableDurations,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        minimumNoticeMin: 240,
        rollingWindowDays: 14,
        mode: "solo",
        scheduleId: input.scheduleId,
        playbookStatus: input.status,
        purpose: input.purpose,
        participantRoles: input.participantRoles,
        preparationItems: input.preparationItems,
        outcomeDefinition: input.outcomeDefinition,
      })
      .returning();
    await tx.insert(schema.eventTypeHosts).values({
      eventTypeId: row!.id,
      userId: input.hostUserId,
      role: "member",
      weight: 1,
    });
    return {
      kind: "created" as const,
      playbook: toPlaybook(row!, await hostsFor(row!.id, tx)),
    };
  });
}

export async function updateConversationPlaybook(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  eventTypeId: string,
  input: ConversationPlaybookInput,
  executor: Db = getDb(),
) {
  const current = await getConversationPlaybook(
    workspaceId,
    actor,
    engagementId,
    eventTypeId,
    executor,
  );
  if (!current) return { kind: "not_found" as const };
  if (!current.canManage) return { kind: "forbidden" as const };
  const readiness = playbookReadiness({
    purpose: input.purpose,
    participantRoles: input.participantRoles,
    preparationItems: input.preparationItems,
    outcomeDefinition: input.outcomeDefinition,
    durationMinutes: input.durationMinutes,
    scheduleId: current.playbook.scheduleId,
    hostCount: current.playbook.hosts.length,
  });
  if (input.status === "ready" && !readiness.ready) {
    return { kind: "not_ready" as const, issues: readiness.issues };
  }
  const [row] = await executor
    .update(schema.eventTypes)
    .set({
      title: input.title.trim(),
      purpose: input.purpose,
      description: input.clientExplanation,
      durationMinutes: input.durationMinutes,
      selectableDurations: input.selectableDurations,
      participantRoles: input.participantRoles,
      preparationItems: input.preparationItems,
      outcomeDefinition: input.outcomeDefinition,
      playbookStatus: input.status,
    })
    .where(and(
      eq(schema.eventTypes.workspaceId, workspaceId),
      eq(schema.eventTypes.engagementId, engagementId),
      eq(schema.eventTypes.id, eventTypeId),
    ))
    .returning();
  return {
    kind: "updated" as const,
    playbook: toPlaybook(row!, await hostsFor(eventTypeId, executor)),
  };
}

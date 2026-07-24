import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  EngagementStatus,
  EngagementType,
  EngagementVisibility,
} from "../core/engagement/model";
import { canTransitionEngagement } from "../core/engagement/model";
import type { EngagementActor } from "../core/engagement/permissions";
import { canManageEngagement } from "../core/engagement/permissions";
import { getDb } from "./client";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export type EngagementCreateInput = {
  clientName: string;
  name: string;
  type: EngagementType;
  status: "draft" | "potential" | "active";
  visibility: EngagementVisibility;
  accountLeadUserId: string;
  expectedEndDate?: string | null;
  people?: { userId: string; role: string }[];
};

export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function accessPredicate(workspaceId: string, actor: EngagementActor) {
  if (actor.workspaceRole === "owner" || actor.workspaceRole === "admin") {
    return eq(schema.engagements.workspaceId, workspaceId);
  }
  return and(
    eq(schema.engagements.workspaceId, workspaceId),
    or(
      eq(schema.engagements.visibility, "workspace"),
      eq(schema.engagements.accountLeadUserId, actor.userId),
      sql`exists (
        select 1 from ${schema.engagementPeople}
        where ${schema.engagementPeople.engagementId} = ${schema.engagements.id}
          and ${schema.engagementPeople.userId} = ${actor.userId}
      )`,
    ),
  );
}

export async function findSimilarClients(
  workspaceId: string,
  name: string,
  executor: Db = getDb(),
) {
  const normalized = normalizeClientName(name);
  if (!normalized) return [];
  return executor
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(and(
      eq(schema.clients.workspaceId, workspaceId),
      or(
        eq(schema.clients.normalizedName, normalized),
        ilike(schema.clients.name, `%${name.trim()}%`),
      ),
    ))
    .limit(5);
}

export async function createEngagement(
  workspaceId: string,
  actor: EngagementActor,
  input: EngagementCreateInput,
  executor: Db = getDb(),
) {
  return executor.transaction(async (tx) => {
    const requestedUserIds = [...new Set([
      actor.userId,
      input.accountLeadUserId,
      ...(input.people ?? []).map((person) => person.userId),
    ])];
    const validMembers = await tx
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.status, "active"),
        inArray(schema.workspaceMembers.userId, requestedUserIds),
      ));
    if (validMembers.length !== requestedUserIds.length) {
      throw new Error("invalid_engagement_person");
    }
    const normalizedName = normalizeClientName(input.clientName);
    let [client] = await tx
      .select()
      .from(schema.clients)
      .where(and(
        eq(schema.clients.workspaceId, workspaceId),
        eq(schema.clients.normalizedName, normalizedName),
      ))
      .limit(1);
    if (!client) {
      [client] = await tx
        .insert(schema.clients)
        .values({
          workspaceId,
          name: input.clientName.trim(),
          normalizedName,
          createdByUserId: actor.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!client) {
        [client] = await tx
          .select()
          .from(schema.clients)
          .where(and(
            eq(schema.clients.workspaceId, workspaceId),
            eq(schema.clients.normalizedName, normalizedName),
          ))
          .limit(1);
      }
    }
    if (!client) throw new Error("client_not_created");

    const [engagement] = await tx
      .insert(schema.engagements)
      .values({
        workspaceId,
        clientId: client.id,
        name: input.name.trim(),
        type: input.type,
        status: input.status,
        visibility: input.visibility,
        accountLeadUserId: input.accountLeadUserId,
        expectedEndDate: input.expectedEndDate || null,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!engagement) throw new Error("engagement_not_created");

    const people = new Map<string, string>([
      [actor.userId, "creator"],
      [input.accountLeadUserId, "account_lead"],
      ...(input.people ?? []).map((person) => [person.userId, person.role] as const),
    ]);
    await tx.insert(schema.engagementPeople).values(
      [...people].map(([userId, role]) => ({
        engagementId: engagement.id,
        userId,
        role,
      })),
    );
    return { engagement, client };
  });
}

export async function listEngagements(
  workspaceId: string,
  actor: EngagementActor,
  filters: { search?: string; status?: EngagementStatus } = {},
  executor: Db = getDb(),
) {
  const conditions = [accessPredicate(workspaceId, actor)];
  if (filters.status) conditions.push(eq(schema.engagements.status, filters.status));
  else conditions.push(ne(schema.engagements.status, "archived"));
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(or(
      ilike(schema.engagements.name, pattern),
      ilike(schema.clients.name, pattern),
    )!);
  }
  return executor
    .select({
      id: schema.engagements.id,
      name: schema.engagements.name,
      type: schema.engagements.type,
      status: schema.engagements.status,
      visibility: schema.engagements.visibility,
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      accountLeadUserId: schema.users.id,
      accountLeadName: schema.users.name,
      expectedEndDate: schema.engagements.expectedEndDate,
      updatedAt: schema.engagements.updatedAt,
    })
    .from(schema.engagements)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.engagements.clientId))
    .innerJoin(schema.users, eq(schema.users.id, schema.engagements.accountLeadUserId))
    .where(and(...conditions))
    .orderBy(desc(schema.engagements.updatedAt));
}

export async function getEngagement(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  executor: Db = getDb(),
) {
  const [engagement] = await executor
    .select({
      id: schema.engagements.id,
      name: schema.engagements.name,
      type: schema.engagements.type,
      status: schema.engagements.status,
      visibility: schema.engagements.visibility,
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      accountLeadUserId: schema.users.id,
      accountLeadName: schema.users.name,
      expectedEndDate: schema.engagements.expectedEndDate,
      createdAt: schema.engagements.createdAt,
      updatedAt: schema.engagements.updatedAt,
    })
    .from(schema.engagements)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.engagements.clientId))
    .innerJoin(schema.users, eq(schema.users.id, schema.engagements.accountLeadUserId))
    .where(and(
      accessPredicate(workspaceId, actor),
      eq(schema.engagements.id, engagementId),
    ));
  if (!engagement) return null;

  const people = await executor
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.engagementPeople.role,
    })
    .from(schema.engagementPeople)
    .innerJoin(schema.users, eq(schema.users.id, schema.engagementPeople.userId))
    .where(eq(schema.engagementPeople.engagementId, engagementId));
  const eventTypes = await executor
    .select({
      id: schema.eventTypes.id,
      title: schema.eventTypes.title,
      slug: schema.eventTypes.slug,
    })
    .from(schema.eventTypes)
    .where(and(
      eq(schema.eventTypes.workspaceId, workspaceId),
      eq(schema.eventTypes.engagementId, engagementId),
    ));
  const eventTypeIds = eventTypes.map((eventType) => eventType.id);
  const meetings = eventTypeIds.length === 0
    ? []
    : await executor
        .select({
          id: schema.bookings.id,
          inviteeName: schema.bookings.inviteeName,
          startsAt: schema.bookings.startsAt,
          status: schema.bookings.status,
        })
        .from(schema.bookings)
        .where(inArray(schema.bookings.eventTypeId, eventTypeIds))
        .orderBy(desc(schema.bookings.startsAt))
        .limit(20);
  return {
    ...engagement,
    people,
    eventTypes,
    meetings,
    canManage: canManageEngagement(actor, engagement),
  };
}

export async function updateEngagementStatus(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  status: EngagementStatus,
  executor: Db = getDb(),
) {
  const current = await getEngagement(workspaceId, actor, engagementId, executor);
  if (!current) return { kind: "not_found" as const };
  if (!current.canManage) return { kind: "forbidden" as const };
  if (!canTransitionEngagement(current.status, status)) {
    return { kind: "invalid_transition" as const };
  }
  const [engagement] = await executor
    .update(schema.engagements)
    .set({ status, updatedAt: new Date() })
    .where(and(
      eq(schema.engagements.workspaceId, workspaceId),
      eq(schema.engagements.id, engagementId),
    ))
    .returning();
  return { kind: "updated" as const, engagement };
}

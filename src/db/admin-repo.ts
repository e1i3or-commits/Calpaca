import { and, eq, inArray, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { eventTypeHosts, eventTypes, schedules, teamMembers, teams, users } from "./schema";

type Db = NodePgDatabase<typeof schema>;

// Dashboard CRUD: everything the host settings surface needs. Scoping rule
// throughout: a user reaches what they own plus what belongs to a team
// they're a member of.

// ---- directory (people picker) ----

export interface DirectoryUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly timezone: string;
}

export async function listUsers(executor: Db = getDb()): Promise<DirectoryUser[]> {
  const rows = await executor
    .select({ id: users.id, name: users.name, email: users.email, timezone: users.timezone })
    .from(users)
    .orderBy(users.name);
  return rows;
}

// ---- schedules ----

export interface ScheduleRule {
  readonly dow: number; // 0 = Sunday
  readonly start: string; // "09:00"
  readonly end: string;
}

export interface ScheduleRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly timezone: string;
  readonly rules: readonly ScheduleRule[];
}

export async function listSchedulesForUser(userId: string, executor: Db = getDb()): Promise<ScheduleRecord[]> {
  return executor.select().from(schedules).where(eq(schedules.userId, userId));
}

export async function createSchedule(
  input: { userId: string; name: string; timezone: string; rules: ScheduleRule[] },
  executor: Db = getDb(),
): Promise<ScheduleRecord> {
  const [row] = await executor.insert(schedules).values(input).returning();
  return row!;
}

export async function updateSchedule(
  id: string,
  userId: string,
  patch: Partial<{ name: string; timezone: string; rules: ScheduleRule[] }>,
  executor: Db = getDb(),
): Promise<ScheduleRecord | null> {
  const [row] = await executor
    .update(schedules)
    .set(patch)
    .where(and(eq(schedules.id, id), eq(schedules.userId, userId)))
    .returning();
  return row ?? null;
}

/** Returns "in_use" when event types still reference the schedule (FK
 * restricts the delete); the route maps that to a 409. */
export async function deleteSchedule(
  id: string,
  userId: string,
  executor: Db = getDb(),
): Promise<"deleted" | "not_found" | "in_use"> {
  const [ref] = await executor
    .select({ id: eventTypes.id })
    .from(eventTypes)
    .where(eq(eventTypes.scheduleId, id))
    .limit(1);
  if (ref) return "in_use";
  const rows = await executor
    .delete(schedules)
    .where(and(eq(schedules.id, id), eq(schedules.userId, userId)))
    .returning({ id: schedules.id });
  return rows.length > 0 ? "deleted" : "not_found";
}

// ---- teams ----

export interface TeamRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface TeamMemberRecord {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly isAdmin: boolean;
}

export async function listTeamsForUser(userId: string, executor: Db = getDb()): Promise<TeamRecord[]> {
  return executor
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId));
}

export async function isTeamMember(teamId: string, userId: string, executor: Db = getDb()): Promise<boolean> {
  const [row] = await executor
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return row !== undefined;
}

/** Creator becomes the first (admin) member. */
export async function createTeam(
  input: { name: string; slug: string; creatorUserId: string },
  executor: Db = getDb(),
): Promise<TeamRecord | "slug_taken"> {
  return executor.transaction(async (tx) => {
    const [existing] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.slug, input.slug));
    if (existing) return "slug_taken";
    const [team] = await tx.insert(teams).values({ name: input.name, slug: input.slug }).returning();
    await tx.insert(teamMembers).values({ teamId: team!.id, userId: input.creatorUserId, isAdmin: true });
    return { id: team!.id, name: team!.name, slug: team!.slug };
  });
}

export async function listTeamMembers(teamId: string, executor: Db = getDb()): Promise<TeamMemberRecord[]> {
  return executor
    .select({ userId: users.id, name: users.name, email: users.email, isAdmin: teamMembers.isAdmin })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  executor: Db = getDb(),
): Promise<void> {
  await executor.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing();
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
  executor: Db = getDb(),
): Promise<boolean> {
  const rows = await executor
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .returning({ userId: teamMembers.userId });
  return rows.length > 0;
}

// ---- event types ----

export interface EventTypeHostInput {
  readonly userId: string;
  readonly role: "member" | "required" | "optional";
  readonly weight: number;
}

export interface AdminEventType {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly teamId: string | null;
  readonly slug: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly mode: "solo" | "round_robin" | "group";
  readonly scheduleId: string | null;
  /** optional so pre-theming test fixtures stay valid; reads always set it */
  readonly theme?: string;
  readonly agentPolicy?: {
    readonly enabled: boolean;
    readonly autoExpireHoldsMin?: number;
  };
  readonly hosts: readonly (EventTypeHostInput & { name: string; email: string })[];
}

async function hostsFor(
  executor: Db,
  eventTypeIds: readonly string[],
): Promise<Map<string, AdminEventType["hosts"][number][]>> {
  if (eventTypeIds.length === 0) return new Map();
  const rows = await executor
    .select({
      eventTypeId: eventTypeHosts.eventTypeId,
      userId: eventTypeHosts.userId,
      role: eventTypeHosts.role,
      weight: eventTypeHosts.weight,
      name: users.name,
      email: users.email,
    })
    .from(eventTypeHosts)
    .innerJoin(users, eq(users.id, eventTypeHosts.userId))
    .where(inArray(eventTypeHosts.eventTypeId, [...eventTypeIds]));
  const byEventType = new Map<string, AdminEventType["hosts"][number][]>();
  for (const { eventTypeId, ...host } of rows) {
    byEventType.set(eventTypeId, [...(byEventType.get(eventTypeId) ?? []), host]);
  }
  return byEventType;
}

function toAdminEventType(
  row: typeof eventTypes.$inferSelect,
  hosts: AdminEventType["hosts"],
): AdminEventType {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    teamId: row.teamId,
    slug: row.slug,
    title: row.title,
    durationMinutes: row.durationMinutes,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    minimumNoticeMin: row.minimumNoticeMin,
    rollingWindowDays: row.rollingWindowDays,
    mode: row.mode,
    scheduleId: row.scheduleId,
    theme: row.theme,
    agentPolicy: row.agentPolicy,
    hosts,
  };
}

export async function listEventTypesForUser(userId: string, executor: Db = getDb()): Promise<AdminEventType[]> {
  const memberTeams = (await listTeamsForUser(userId, executor)).map((t) => t.id);
  const rows = await executor
    .select()
    .from(eventTypes)
    .where(
      memberTeams.length > 0
        ? or(eq(eventTypes.ownerUserId, userId), inArray(eventTypes.teamId, memberTeams))
        : eq(eventTypes.ownerUserId, userId),
    );
  const hosts = await hostsFor(executor, rows.map((r) => r.id));
  return rows.map((r) => toAdminEventType(r, hosts.get(r.id) ?? []));
}

/** Load one event type the user may manage (owner or member of its team). */
export async function getEventTypeForAdmin(
  id: string,
  userId: string,
  executor: Db = getDb(),
): Promise<AdminEventType | null> {
  const [row] = await executor.select().from(eventTypes).where(eq(eventTypes.id, id));
  if (!row) return null;
  const allowed =
    row.ownerUserId === userId || (row.teamId !== null && (await isTeamMember(row.teamId, userId, executor)));
  if (!allowed) return null;
  const hosts = await hostsFor(executor, [row.id]);
  return toAdminEventType(row, hosts.get(row.id) ?? []);
}

export interface EventTypeInput {
  readonly slug: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly mode: "solo" | "round_robin" | "group";
  readonly scheduleId: string | null;
  readonly teamId: string | null;
  /** undefined keeps the column default (create) or leaves it unchanged (update) */
  readonly theme?: string;
  /** Same compatibility behavior as theme for dashboard clients predating agent policy. */
  readonly agentPolicy?: {
    readonly enabled: boolean;
    readonly autoExpireHoldsMin?: number;
  };
  readonly hosts: readonly EventTypeHostInput[];
}

export async function createEventType(
  ownerUserId: string,
  input: EventTypeInput,
  executor: Db = getDb(),
): Promise<AdminEventType | "slug_taken"> {
  return executor.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: eventTypes.id })
      .from(eventTypes)
      .where(and(eq(eventTypes.slug, input.slug), eq(eventTypes.ownerUserId, ownerUserId)));
    if (existing) return "slug_taken";
    const [row] = await tx
      .insert(eventTypes)
      .values({ ...input, ownerUserId, scheduleId: input.scheduleId, teamId: input.teamId })
      .returning();
    if (input.hosts.length > 0) {
      await tx.insert(eventTypeHosts).values(input.hosts.map((h) => ({ ...h, eventTypeId: row!.id })));
    }
    const hosts = await hostsFor(tx, [row!.id]);
    return toAdminEventType(row!, hosts.get(row!.id) ?? []);
  });
}

export async function updateEventType(
  id: string,
  userId: string,
  input: EventTypeInput,
  executor: Db = getDb(),
): Promise<AdminEventType | null> {
  return executor.transaction(async (tx) => {
    const existing = await getEventTypeForAdmin(id, userId, tx);
    if (!existing) return null;
    const [row] = await tx
      .update(eventTypes)
      .set({
        slug: input.slug,
        title: input.title,
        durationMinutes: input.durationMinutes,
        bufferBeforeMin: input.bufferBeforeMin,
        bufferAfterMin: input.bufferAfterMin,
        minimumNoticeMin: input.minimumNoticeMin,
        rollingWindowDays: input.rollingWindowDays,
        mode: input.mode,
        scheduleId: input.scheduleId,
        teamId: input.teamId,
        theme: input.theme,
        agentPolicy: input.agentPolicy,
      })
      .where(eq(eventTypes.id, id))
      .returning();
    // replace-all host assignment: the picker sends the full set
    await tx.delete(eventTypeHosts).where(eq(eventTypeHosts.eventTypeId, id));
    if (input.hosts.length > 0) {
      await tx.insert(eventTypeHosts).values(input.hosts.map((h) => ({ ...h, eventTypeId: id })));
    }
    const hosts = await hostsFor(tx, [id]);
    return toAdminEventType(row!, hosts.get(id) ?? []);
  });
}

/** "in_use" when bookings/holds reference it — surfaced as a 409, never a
 * cascade: booking history is immutable. */
export async function deleteEventType(
  id: string,
  userId: string,
  executor: Db = getDb(),
): Promise<"deleted" | "not_found" | "in_use"> {
  const existing = await getEventTypeForAdmin(id, userId, executor);
  if (!existing) return "not_found";
  try {
    return await executor.transaction(async (tx) => {
      await tx.delete(eventTypeHosts).where(eq(eventTypeHosts.eventTypeId, id));
      await tx.delete(eventTypes).where(eq(eventTypes.id, id));
      return "deleted" as const;
    });
  } catch {
    // FK violation from bookings/holds referencing the event type
    return "in_use";
  }
}

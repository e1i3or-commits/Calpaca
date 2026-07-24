import { and, eq, inArray, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { bookingPages, eventTypeHosts, eventTypes, schedules, teamMembers, teams, users } from "./schema";
import type { ScheduleOverride } from "../core/availability/overrides";
import type { BookingQuestion } from "../core/booking/questions";
import type { EventLocation } from "../core/booking/locations";

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

export async function listUsers(
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<DirectoryUser[]> {
  if (workspaceId) {
    return executor
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
      })
      .from(schema.workspaceMembers)
      .innerJoin(users, eq(schema.workspaceMembers.userId, users.id))
      .where(and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.status, "active"),
      ))
      .orderBy(users.name);
  }
  const rows = await executor
    .select({ id: users.id, name: users.name, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.status, "active"))
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
  readonly overrides?: readonly ScheduleOverride[];
}

export async function listSchedulesForUser(userId: string, executor: Db = getDb()): Promise<ScheduleRecord[]> {
  return executor.select().from(schedules).where(eq(schedules.userId, userId));
}

export async function createSchedule(
  input: {
    userId: string;
    name: string;
    timezone: string;
    rules: ScheduleRule[];
    overrides: ScheduleOverride[];
  },
  executor: Db = getDb(),
): Promise<ScheduleRecord> {
  const [row] = await executor.insert(schedules).values(input).returning();
  return row!;
}

export async function updateSchedule(
  id: string,
  userId: string,
  patch: Partial<{
    name: string;
    timezone: string;
    rules: ScheduleRule[];
    overrides: ScheduleOverride[];
  }>,
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

export async function listTeamsForUser(
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<TeamRecord[]> {
  const [actor] = await executor
    .select({ role: users.appRole, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [membership] = workspaceId
    ? await executor
        .select({ role: schema.workspaceMembers.role, status: schema.workspaceMembers.status })
        .from(schema.workspaceMembers)
        .where(and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ))
        .limit(1)
    : [];
  if (
    (workspaceId && membership?.status === "active" &&
      (membership.role === "owner" || membership.role === "admin")) ||
    (!workspaceId &&
    actor?.status === "active"
    && (actor.role === "owner" || actor.role === "admin"))
  ) {
    const query = executor
      .select({ id: teams.id, name: teams.name, slug: teams.slug })
      .from(teams);
    return workspaceId
      ? query.where(eq(teams.workspaceId, workspaceId)).orderBy(teams.name)
      : query.orderBy(teams.name);
  }
  return executor
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(and(
      eq(teamMembers.userId, userId),
      ...(workspaceId ? [eq(teams.workspaceId, workspaceId)] : []),
    ));
}

export async function isAppAdmin(
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<boolean> {
  if (workspaceId) {
    const [membership] = await executor
      .select({ role: schema.workspaceMembers.role, status: schema.workspaceMembers.status })
      .from(schema.workspaceMembers)
      .where(and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ));
    return membership?.status === "active"
      && (membership.role === "owner" || membership.role === "admin");
  }
  const [row] = await executor
    .select({ role: users.appRole, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.status === "active" && (row.role === "owner" || row.role === "admin");
}

export async function isTeamMember(teamId: string, userId: string, executor: Db = getDb()): Promise<boolean> {
  const [row] = await executor
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return row !== undefined;
}

export async function isTeamAdmin(teamId: string, userId: string, executor: Db = getDb()): Promise<boolean> {
  const [row] = await executor
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.userId, userId),
      eq(teamMembers.isAdmin, true),
    ));
  return row !== undefined;
}

/** Creator becomes the first (admin) member. */
export async function createTeam(
  input: { name: string; slug: string; creatorUserId: string; workspaceId?: string },
  executor: Db = getDb(),
): Promise<TeamRecord | "slug_taken"> {
  return executor.transaction(async (tx) => {
    const [existing] = await tx.select({ id: teams.id }).from(teams).where(and(
      eq(teams.slug, input.slug),
      ...(input.workspaceId ? [eq(teams.workspaceId, input.workspaceId)] : []),
    ));
    if (existing) return "slug_taken";
    const [team] = await tx.insert(teams).values({
      name: input.name,
      slug: input.slug,
      workspaceId: input.workspaceId,
    }).returning();
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
): Promise<"removed" | "not_found" | "last_admin"> {
  return executor.transaction(async (tx) => {
    const [target] = await tx
      .select({ isAdmin: teamMembers.isAdmin })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    if (!target) return "not_found";
    if (target.isAdmin) {
      const admins = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isAdmin, true)));
      if (admins.length === 1) return "last_admin";
    }
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return "removed";
  });
}

export async function updateTeamMemberAdmin(
  teamId: string,
  userId: string,
  isAdmin: boolean,
  executor: Db = getDb(),
): Promise<"updated" | "not_found" | "last_admin"> {
  return executor.transaction(async (tx) => {
    const [target] = await tx
      .select({ isAdmin: teamMembers.isAdmin })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    if (!target) return "not_found";
    if (target.isAdmin && !isAdmin) {
      const admins = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isAdmin, true)));
      if (admins.length === 1) return "last_admin";
    }
    await tx
      .update(teamMembers)
      .set({ isAdmin })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return "updated";
  });
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
  readonly description?: string | null;
  readonly durationMinutes: number;
  readonly selectableDurations?: number[];
  readonly capacity?: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly mode: "solo" | "round_robin" | "group";
  readonly scheduleId: string | null;
  /** optional so pre-theming test fixtures stay valid; reads always set it */
  readonly theme?: string;
  readonly layout?: string;
  readonly logoUrl?: string | null;
  readonly meetingFormats?: ("phone" | "google_meet")[];
  readonly bookingQuestions?: BookingQuestion[];
  readonly emailVerificationRequired?: boolean;
  readonly locations?: EventLocation[];
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
    description: row.description,
    durationMinutes: row.durationMinutes,
    selectableDurations: row.selectableDurations,
    capacity: row.capacity,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    minimumNoticeMin: row.minimumNoticeMin,
    rollingWindowDays: row.rollingWindowDays,
    mode: row.mode,
    scheduleId: row.scheduleId,
    theme: row.theme,
    layout: row.layout,
    logoUrl: row.logoUrl,
    meetingFormats: row.meetingFormats,
    bookingQuestions: row.bookingQuestions,
    emailVerificationRequired: row.emailVerificationRequired,
    locations: row.locations,
    agentPolicy: row.agentPolicy,
    hosts,
  };
}

export async function listEventTypesForUser(
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<AdminEventType[]> {
  const memberTeams = (await listTeamsForUser(userId, executor, workspaceId)).map((t) => t.id);
  const ownership = memberTeams.length > 0
    ? or(eq(eventTypes.ownerUserId, userId), inArray(eventTypes.teamId, memberTeams))
    : eq(eventTypes.ownerUserId, userId);
  const rows = await executor
    .select()
    .from(eventTypes)
    .where(workspaceId ? and(eq(eventTypes.workspaceId, workspaceId), ownership) : ownership);
  const hosts = await hostsFor(executor, rows.map((r) => r.id));
  return rows.map((r) => toAdminEventType(r, hosts.get(r.id) ?? []));
}

/** Load one event type the user may manage (owner or member of its team). */
export async function getEventTypeForAdmin(
  id: string,
  userId: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<AdminEventType | null> {
  const [row] = await executor.select().from(eventTypes).where(
    workspaceId
      ? and(eq(eventTypes.id, id), eq(eventTypes.workspaceId, workspaceId))
      : eq(eventTypes.id, id),
  );
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
  readonly description?: string | null;
  readonly durationMinutes: number;
  readonly selectableDurations?: number[];
  readonly capacity?: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly mode: "solo" | "round_robin" | "group";
  readonly scheduleId: string | null;
  readonly teamId: string | null;
  /** undefined keeps the column default (create) or leaves it unchanged (update) */
  readonly theme?: string;
  readonly layout?: string;
  readonly logoUrl?: string | null;
  readonly meetingFormats?: ("phone" | "google_meet")[];
  readonly bookingQuestions?: BookingQuestion[];
  readonly emailVerificationRequired?: boolean;
  readonly locations?: EventLocation[];
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
  workspaceId?: string,
): Promise<AdminEventType | "slug_taken"> {
  return executor.transaction(async (tx) => {
    const resolvedWorkspaceId = workspaceId ?? (
      await tx
        .select({ workspaceId: schema.workspaceMembers.workspaceId })
        .from(schema.workspaceMembers)
        .where(eq(schema.workspaceMembers.userId, ownerUserId))
        .limit(1)
    )[0]?.workspaceId;
    if (!resolvedWorkspaceId) throw new Error("workspace membership required");
    const [existing] = await tx
      .select({ id: eventTypes.id })
      .from(eventTypes)
      .where(and(
        eq(eventTypes.slug, input.slug),
        eq(eventTypes.workspaceId, resolvedWorkspaceId),
      ));
    if (existing) return "slug_taken";
    const [row] = await tx
      .insert(eventTypes)
      .values({
        ...input,
        workspaceId: resolvedWorkspaceId,
        ownerUserId,
        scheduleId: input.scheduleId,
        teamId: input.teamId,
      })
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
  workspaceId?: string,
): Promise<AdminEventType | null> {
  return executor.transaction(async (tx) => {
    const existing = await getEventTypeForAdmin(id, userId, tx, workspaceId);
    if (!existing) return null;
    const [row] = await tx
      .update(eventTypes)
      .set({
        slug: input.slug,
        title: input.title,
        description: input.description,
        durationMinutes: input.durationMinutes,
        selectableDurations: input.selectableDurations,
        capacity: input.capacity,
        bufferBeforeMin: input.bufferBeforeMin,
        bufferAfterMin: input.bufferAfterMin,
        minimumNoticeMin: input.minimumNoticeMin,
        rollingWindowDays: input.rollingWindowDays,
        mode: input.mode,
        scheduleId: input.scheduleId,
        teamId: input.teamId,
        theme: input.theme,
        layout: input.layout,
        logoUrl: input.logoUrl,
        meetingFormats: input.meetingFormats,
        bookingQuestions: input.bookingQuestions,
        emailVerificationRequired: input.emailVerificationRequired,
        locations: input.locations,
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
  workspaceId?: string,
): Promise<"deleted" | "not_found" | "in_use"> {
  const existing = await getEventTypeForAdmin(id, userId, executor, workspaceId);
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

export interface BookingPageRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly theme: string;
  readonly logoUrl: string | null;
  readonly eventTypeIds: string[];
}

export async function listBookingPages(
  workspaceId: string,
  executor: Db = getDb(),
): Promise<BookingPageRecord[]> {
  return executor
    .select({
      id: bookingPages.id,
      slug: bookingPages.slug,
      title: bookingPages.title,
      description: bookingPages.description,
      theme: bookingPages.theme,
      logoUrl: bookingPages.logoUrl,
      eventTypeIds: bookingPages.eventTypeIds,
    })
    .from(bookingPages)
    .where(eq(bookingPages.workspaceId, workspaceId))
    .orderBy(bookingPages.title);
}

export async function saveBookingPage(
  workspaceId: string,
  input: Omit<BookingPageRecord, "id">,
  id?: string,
  executor: Db = getDb(),
): Promise<BookingPageRecord | "slug_taken" | "invalid_event_types" | null> {
  const selected = input.eventTypeIds.length
    ? await executor
        .select({ id: eventTypes.id })
        .from(eventTypes)
        .where(and(
          eq(eventTypes.workspaceId, workspaceId),
          inArray(eventTypes.id, input.eventTypeIds),
        ))
    : [];
  if (selected.length !== new Set(input.eventTypeIds).size) return "invalid_event_types";
  try {
    const [row] = id
      ? await executor
          .update(bookingPages)
          .set({ ...input, updatedAt: new Date() })
          .where(and(eq(bookingPages.id, id), eq(bookingPages.workspaceId, workspaceId)))
          .returning()
      : await executor
          .insert(bookingPages)
          .values({ ...input, workspaceId })
          .returning();
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      theme: row.theme,
      logoUrl: row.logoUrl,
      eventTypeIds: row.eventTypeIds,
    };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return "slug_taken";
    throw error;
  }
}

export async function deleteBookingPage(
  workspaceId: string,
  id: string,
  executor: Db = getDb(),
): Promise<boolean> {
  return (await executor
    .delete(bookingPages)
    .where(and(eq(bookingPages.id, id), eq(bookingPages.workspaceId, workspaceId)))
    .returning({ id: bookingPages.id })).length > 0;
}

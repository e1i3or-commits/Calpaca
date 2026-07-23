import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import * as schema from "./schema";
import { bookings, calendarBusyCache, calendarConnections, eventTypeHosts, eventTypes, schedules, teams, users } from "./schema";
import type { Interval } from "../core/availability/intervals";
import type { WeeklyRule } from "../core/availability/rules";
import type { ScheduleOverride } from "../core/availability/overrides";

type Db = NodePgDatabase<typeof schema>;

export interface EventTypeConfig {
  readonly id: string;
  readonly slug: string;
  // optional so injected test fixtures predating theming stay valid;
  // the repo always populates both
  readonly title?: string;
  readonly description?: string | null;
  readonly theme?: string;
  readonly layout?: string;
  readonly logoUrl?: string | null;
  readonly meetingFormats?: readonly ("phone" | "google_meet")[];
  readonly mode?: AssignmentMode;
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly maxPerDay: number | null;
  readonly curatedSlotCount: number;
  readonly publicSelectableHostIds: readonly string[];
  readonly agentPolicy?: {
    readonly enabled: boolean;
    readonly autoExpireHoldsMin?: number;
  };
}

export type AssignmentMode = "solo" | "round_robin" | "group";

/** Booking-endpoint view of an event type: adds the assignment mode the
 * availability endpoint has no use for, and drops the fields only it needs. */
export interface BookingEventTypeConfig {
  readonly id: string;
  readonly slug: string;
  /** optional for the same fixture-compatibility reason as EventTypeConfig */
  readonly theme?: string;
  readonly layout?: string;
  readonly meetingFormats?: readonly ("phone" | "google_meet")[];
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly mode: AssignmentMode;
  readonly publicSelectableHostIds: readonly string[];
  readonly agentPolicy?: {
    readonly enabled: boolean;
    readonly autoExpireHoldsMin?: number;
  };
}

function toBookingEventTypeConfig(row: typeof eventTypes.$inferSelect): BookingEventTypeConfig {
  return {
    id: row.id,
    slug: row.slug,
    theme: row.theme,
    layout: row.layout,
    meetingFormats: row.meetingFormats,
    durationMinutes: row.durationMinutes,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    minimumNoticeMin: row.minimumNoticeMin,
    mode: row.mode,
    publicSelectableHostIds: row.publicSelectableHostIds,
    agentPolicy: row.agentPolicy,
  };
}

export interface EventTypeHostRecord {
  readonly userId: string;
  readonly role: "member" | "required" | "optional";
  readonly weight: number;
  /** Optional so existing injected fixtures remain valid; the real repo joins both. */
  readonly name?: string;
  readonly image?: string | null;
}

export interface HostSchedule {
  readonly userId: string;
  readonly timezone: string;
  readonly rules: readonly WeeklyRule[];
  readonly overrides?: readonly ScheduleOverride[];
}

export interface HostBusy {
  readonly userId: string;
  readonly intervals: readonly Interval[];
}

function toInstant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

/** Loads one event type by its public slug, or null if none matches. */
export async function getEventTypeBySlug(
  slug: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<EventTypeConfig | null> {
  const [row] = await executor.select().from(eventTypes).where(
    workspaceId
      ? and(eq(eventTypes.slug, slug), eq(eventTypes.workspaceId, workspaceId))
      : eq(eventTypes.slug, slug),
  );
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    theme: row.theme,
    layout: row.layout,
    logoUrl: row.logoUrl,
    meetingFormats: row.meetingFormats,
    mode: row.mode,
    durationMinutes: row.durationMinutes,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    minimumNoticeMin: row.minimumNoticeMin,
    rollingWindowDays: row.rollingWindowDays,
    maxPerDay: row.maxPerDay,
    curatedSlotCount: row.curatedSlotCount,
    publicSelectableHostIds: row.publicSelectableHostIds,
    agentPolicy: row.agentPolicy,
  };
}

/** Loads one event type by slug for the booking endpoints (task 14): same
 * table as getEventTypeBySlug, but shaped around assignment mode instead of
 * slot-rendering config. */
export async function getEventTypeForBooking(
  slug: string,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<BookingEventTypeConfig | null> {
  const [row] = await executor.select().from(eventTypes).where(
    workspaceId
      ? and(eq(eventTypes.slug, slug), eq(eventTypes.workspaceId, workspaceId))
      : eq(eventTypes.slug, slug),
  );
  return row ? toBookingEventTypeConfig(row) : null;
}

/** Same shape as getEventTypeForBooking, keyed by id (reschedule looks up the
 * event type of an existing booking, which only has the id, not the slug). */
export async function getEventTypeForBookingById(
  id: string,
  executor: Db = getDb(),
): Promise<BookingEventTypeConfig | null> {
  const [row] = await executor.select().from(eventTypes).where(eq(eventTypes.id, id));
  return row ? toBookingEventTypeConfig(row) : null;
}

/** Public identity of who the invitee is booking with: the team name when the
 * event type belongs to one, and each host's display name + avatar. Emails
 * stay out — this feeds an unauthenticated endpoint. */
export interface EventTypeProfile {
  readonly teamName: string | null;
  readonly hosts: readonly { readonly name: string; readonly image: string | null }[];
}

export async function getEventTypeProfile(
  eventTypeId: string,
  executor: Db = getDb(),
): Promise<EventTypeProfile> {
  const [teamRows, hostRows] = await Promise.all([
    executor
      .select({ teamName: teams.name })
      .from(eventTypes)
      .leftJoin(teams, eq(eventTypes.teamId, teams.id))
      .where(eq(eventTypes.id, eventTypeId)),
    executor
      .select({ name: users.name, image: users.image })
      .from(eventTypeHosts)
      .innerJoin(users, eq(eventTypeHosts.userId, users.id))
      .where(eq(eventTypeHosts.eventTypeId, eventTypeId)),
  ]);
  return { teamName: teamRows[0]?.teamName ?? null, hosts: hostRows };
}

/** Loads every host assigned to an event type, with their round-robin/group role. */
export async function getEventTypeHosts(
  eventTypeId: string,
  executor: Db = getDb(),
): Promise<EventTypeHostRecord[]> {
  return executor
    .select({
      userId: eventTypeHosts.userId,
      role: eventTypeHosts.role,
      weight: eventTypeHosts.weight,
      name: users.name,
      image: users.image,
    })
    .from(eventTypeHosts)
    .innerJoin(users, eq(eventTypeHosts.userId, users.id))
    .where(eq(eventTypeHosts.eventTypeId, eventTypeId));
}

/** Loads each user's working-hours schedule, keyed by userId. Users without one are omitted. */
export async function getSchedulesForUsers(
  userIds: readonly string[],
  executor: Db = getDb(),
): Promise<HostSchedule[]> {
  if (userIds.length === 0) return [];

  const found = await executor
    .select({
      userId: schedules.userId,
      timezone: schedules.timezone,
      rules: schedules.rules,
      overrides: schedules.overrides,
    })
    .from(schedules)
    .where(inArray(schedules.userId, [...userIds]));
  const byUser = new Map(found.map((row) => [row.userId, row]));
  let pending = [...new Set(found.flatMap((row) =>
    row.overrides.flatMap((override) =>
      override.forwardToUserId ? [override.forwardToUserId] : [],
    ),
  ))].filter((id) => !byUser.has(id));

  // Resolve forwarding chains in bounded batches. The visited map makes
  // cycles harmless; the depth cap protects against malformed legacy data.
  for (let depth = 0; pending.length > 0 && depth < 20; depth += 1) {
    const rows = await executor
      .select({
        userId: schedules.userId,
        timezone: schedules.timezone,
        rules: schedules.rules,
        overrides: schedules.overrides,
      })
      .from(schedules)
      .where(inArray(schedules.userId, pending));
    for (const row of rows) byUser.set(row.userId, row);
    pending = [...new Set(rows.flatMap((row) =>
      row.overrides.flatMap((override) =>
        override.forwardToUserId ? [override.forwardToUserId] : [],
      ),
    ))].filter((id) => !byUser.has(id));
  }

  return [...byUser.values()];
}

/**
 * Loads busy intervals overlapping `window`, grouped by user, from two
 * sources: the calendar busy cache (joined through calendar_connections
 * since busy rows only carry a connection id — never Google directly, per
 * docs/ARCHITECTURE.md) and confirmed platform bookings. Bookings must be
 * here, not just in the holds index: a confirmed hold no longer conflicts
 * under active_hold_uq, so without this a taken slot is offered — and
 * re-verified as free — for a second booking.
 */
export async function getBusyForUsers(
  userIds: readonly string[],
  window: Interval,
  executor: Db = getDb(),
): Promise<HostBusy[]> {
  if (userIds.length === 0) return [];

  const [cacheRows, bookingRows] = await Promise.all([
    executor
      .select({
        userId: calendarConnections.userId,
        startsAt: calendarBusyCache.startsAt,
        endsAt: calendarBusyCache.endsAt,
      })
      .from(calendarBusyCache)
      .innerJoin(calendarConnections, eq(calendarBusyCache.connectionId, calendarConnections.id))
      .where(
        and(
          inArray(calendarConnections.userId, [...userIds]),
          eq(calendarConnections.conflictEnabled, true),
          lt(calendarBusyCache.startsAt, toDate(window.end)),
          gte(calendarBusyCache.endsAt, toDate(window.start)),
        ),
      ),
    executor
      .select({
        hostUserIds: bookings.hostUserIds,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "confirmed"),
          lt(bookings.startsAt, toDate(window.end)),
          gte(bookings.endsAt, toDate(window.start)),
        ),
      ),
  ]);

  const wanted = new Set(userIds);
  const byUser = new Map<string, Interval[]>();
  const push = (userId: string, startsAt: Date, endsAt: Date) => {
    const list = byUser.get(userId) ?? [];
    list.push({ start: toInstant(startsAt), end: toInstant(endsAt) });
    byUser.set(userId, list);
  };

  for (const row of cacheRows) push(row.userId, row.startsAt, row.endsAt);
  // host_user_ids is jsonb, so membership is filtered here rather than in SQL;
  // bookings overlapping the window are few and bookings_time_idx bounds the scan
  for (const row of bookingRows) {
    for (const hostId of row.hostUserIds) {
      if (wanted.has(hostId)) push(hostId, row.startsAt, row.endsAt);
    }
  }

  return [...byUser.entries()].map(([userId, intervals]) => ({ userId, intervals }));
}

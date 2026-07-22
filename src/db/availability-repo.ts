import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import * as schema from "./schema";
import { calendarBusyCache, calendarConnections, eventTypeHosts, eventTypes, schedules } from "./schema";
import type { Interval } from "../core/availability/intervals";
import type { WeeklyRule } from "../core/availability/rules";

type Db = NodePgDatabase<typeof schema>;

export interface EventTypeConfig {
  readonly id: string;
  readonly slug: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly maxPerDay: number | null;
  readonly curatedSlotCount: number;
  readonly publicSelectableHostIds: readonly string[];
}

export interface EventTypeHostRecord {
  readonly userId: string;
  readonly role: "member" | "required" | "optional";
  readonly weight: number;
}

export interface HostSchedule {
  readonly userId: string;
  readonly timezone: string;
  readonly rules: readonly WeeklyRule[];
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
): Promise<EventTypeConfig | null> {
  const [row] = await executor.select().from(eventTypes).where(eq(eventTypes.slug, slug));
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    durationMinutes: row.durationMinutes,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    minimumNoticeMin: row.minimumNoticeMin,
    rollingWindowDays: row.rollingWindowDays,
    maxPerDay: row.maxPerDay,
    curatedSlotCount: row.curatedSlotCount,
    publicSelectableHostIds: row.publicSelectableHostIds,
  };
}

/** Loads every host assigned to an event type, with their round-robin/group role. */
export async function getEventTypeHosts(
  eventTypeId: string,
  executor: Db = getDb(),
): Promise<EventTypeHostRecord[]> {
  return executor
    .select({ userId: eventTypeHosts.userId, role: eventTypeHosts.role, weight: eventTypeHosts.weight })
    .from(eventTypeHosts)
    .where(eq(eventTypeHosts.eventTypeId, eventTypeId));
}

/** Loads each user's working-hours schedule, keyed by userId. Users without one are omitted. */
export async function getSchedulesForUsers(
  userIds: readonly string[],
  executor: Db = getDb(),
): Promise<HostSchedule[]> {
  if (userIds.length === 0) return [];

  return executor
    .select({ userId: schedules.userId, timezone: schedules.timezone, rules: schedules.rules })
    .from(schedules)
    .where(inArray(schedules.userId, [...userIds]));
}

/**
 * Loads calendar-busy-cache intervals overlapping `window`, grouped by the
 * owning user (joined through calendar_connections since busy rows only
 * carry a connection id). Never reads Google directly, per the sync design
 * in docs/ARCHITECTURE.md — the cache is the only source on the request path.
 */
export async function getBusyForUsers(
  userIds: readonly string[],
  window: Interval,
  executor: Db = getDb(),
): Promise<HostBusy[]> {
  if (userIds.length === 0) return [];

  const rows = await executor
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
        lt(calendarBusyCache.startsAt, toDate(window.end)),
        gte(calendarBusyCache.endsAt, toDate(window.start)),
      ),
    );

  const byUser = new Map<string, Interval[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ start: toInstant(row.startsAt), end: toInstant(row.endsAt) });
    byUser.set(row.userId, list);
  }

  return [...byUser.entries()].map(([userId, intervals]) => ({ userId, intervals }));
}

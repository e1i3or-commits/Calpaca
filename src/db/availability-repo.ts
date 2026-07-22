import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { getDb } from "./client";
import * as schema from "./schema";
import { bookings, calendarBusyCache, calendarConnections, eventTypeHosts, eventTypes, schedules } from "./schema";
import type { Interval } from "../core/availability/intervals";
import type { WeeklyRule } from "../core/availability/rules";

type Db = NodePgDatabase<typeof schema>;

export interface EventTypeConfig {
  readonly id: string;
  readonly slug: string;
  // optional so injected test fixtures predating theming stay valid;
  // the repo always populates both
  readonly title?: string;
  readonly theme?: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly maxPerDay: number | null;
  readonly curatedSlotCount: number;
  readonly publicSelectableHostIds: readonly string[];
}

export type AssignmentMode = "solo" | "round_robin" | "group";

/** Booking-endpoint view of an event type: adds the assignment mode the
 * availability endpoint has no use for, and drops the fields only it needs. */
export interface BookingEventTypeConfig {
  readonly id: string;
  readonly slug: string;
  /** optional for the same fixture-compatibility reason as EventTypeConfig */
  readonly theme?: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly mode: AssignmentMode;
  readonly publicSelectableHostIds: readonly string[];
}

function toBookingEventTypeConfig(row: typeof eventTypes.$inferSelect): BookingEventTypeConfig {
  return {
    id: row.id,
    slug: row.slug,
    theme: row.theme,
    durationMinutes: row.durationMinutes,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    minimumNoticeMin: row.minimumNoticeMin,
    mode: row.mode,
    publicSelectableHostIds: row.publicSelectableHostIds,
  };
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
    title: row.title,
    theme: row.theme,
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

/** Loads one event type by slug for the booking endpoints (task 14): same
 * table as getEventTypeBySlug, but shaped around assignment mode instead of
 * slot-rendering config. */
export async function getEventTypeForBooking(
  slug: string,
  executor: Db = getDb(),
): Promise<BookingEventTypeConfig | null> {
  const [row] = await executor.select().from(eventTypes).where(eq(eventTypes.slug, slug));
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

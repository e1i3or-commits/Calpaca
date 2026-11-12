import { and, asc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import {
  closedDaysBetween,
  DEFAULT_US_HOLIDAYS,
  isUsHolidayKey,
  type ClosedDay,
  type ClosedRange,
  type UsHolidayKey,
} from "@calpaca/core";
import { getDb } from "./client";
import * as schema from "./schema";
import { workspaceClosedDays, workspaceMembers, workspaces } from "./schema";

type Db = NodePgDatabase<typeof schema>;

export interface ClosedDayRange extends ClosedRange {
  readonly id: string;
}

export interface WorkspaceClosedDays {
  readonly usHolidays: readonly UsHolidayKey[];
  readonly ranges: readonly ClosedDayRange[];
}

function holidaysOf(stored: readonly string[] | null): UsHolidayKey[] {
  return stored === null ? [...DEFAULT_US_HOLIDAYS] : stored.filter(isUsHolidayKey);
}

export async function getWorkspaceClosedDays(workspaceId: string, executor: Db = getDb()): Promise<WorkspaceClosedDays> {
  const [workspace] = await executor.select({ usHolidays: workspaces.usHolidays }).from(workspaces).where(eq(workspaces.id, workspaceId));
  const ranges = await executor
    .select({ id: workspaceClosedDays.id, name: workspaceClosedDays.name, startDate: workspaceClosedDays.startDate, endDate: workspaceClosedDays.endDate })
    .from(workspaceClosedDays)
    .where(eq(workspaceClosedDays.workspaceId, workspaceId))
    .orderBy(asc(workspaceClosedDays.startDate));
  return { usHolidays: holidaysOf(workspace?.usHolidays ?? null), ranges };
}

export async function setWorkspaceUsHolidays(workspaceId: string, keys: readonly UsHolidayKey[], executor: Db = getDb()): Promise<void> {
  await executor.update(workspaces).set({ usHolidays: [...new Set(keys)], updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
}

export async function addWorkspaceClosedRange(workspaceId: string, range: ClosedRange, executor: Db = getDb()): Promise<ClosedDayRange> {
  const [row] = await executor.insert(workspaceClosedDays).values({ workspaceId, ...range })
    .returning({ id: workspaceClosedDays.id, name: workspaceClosedDays.name, startDate: workspaceClosedDays.startDate, endDate: workspaceClosedDays.endDate });
  return row!;
}

/** False when no such range exists in this workspace. */
export async function deleteWorkspaceClosedRange(workspaceId: string, id: string, executor: Db = getDb()): Promise<boolean> {
  const removed = await executor.delete(workspaceClosedDays)
    .where(and(eq(workspaceClosedDays.workspaceId, workspaceId), eq(workspaceClosedDays.id, id)))
    .returning({ id: workspaceClosedDays.id });
  return removed.length > 0;
}

/** The workspace's closed days between two dates, holidays and its own ranges together. */
export async function workspaceClosedDaysBetween(workspaceId: string, fromDate: string, toDate: string, executor: Db = getDb()): Promise<ClosedDay[]> {
  const config = await getWorkspaceClosedDays(workspaceId, executor);
  return closedDaysBetween(fromDate, toDate, config.usHolidays, config.ranges);
}

/**
 * Each user's closed days from last year to two years out: the union over the
 * workspaces they are an active member of. The span covers every booking
 * window a host can publish without loading the whole calendar.
 */
export async function closedDaysForUsers(userIds: readonly string[], executor: Db = getDb()): Promise<Map<string, ClosedDay[]>> {
  const out = new Map<string, ClosedDay[]>();
  if (userIds.length === 0) return out;
  const memberships = await executor
    .select({ userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(inArray(workspaceMembers.userId, [...userIds]), eq(workspaceMembers.status, "active")));
  const workspaceIds = [...new Set(memberships.map((row) => row.workspaceId))];
  if (workspaceIds.length === 0) return out;
  const year = Temporal.Now.plainDateISO("UTC").year;
  const from = `${year - 1}-01-01`;
  const to = `${year + 2}-12-31`;
  const byWorkspace = new Map<string, ClosedDay[]>();
  for (const workspaceId of workspaceIds) {
    byWorkspace.set(workspaceId, await workspaceClosedDaysBetween(workspaceId, from, to, executor));
  }
  for (const { userId, workspaceId } of memberships) {
    out.set(userId, [...(out.get(userId) ?? []), ...(byWorkspace.get(workspaceId) ?? [])]);
  }
  return out;
}

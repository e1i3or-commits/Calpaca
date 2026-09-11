import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { evaluateKickoffReadiness } from "../core/engagement/kickoff-readiness";
import { onboardingAttendance } from "../core/engagement/franchise-onboarding";
import * as s from "./schema";

/** Caller must authorize access to the Engagement before reading this report.
 * Explicit projections exclude emails, OAuth tokens and calendar identifiers. */
export async function getKickoffReadiness(row: typeof s.franchiseOnboarding.$inferSelect, db: NodePgDatabase<typeof s>, now = new Date(), meetingKind: "kickoff"|"followup" = "kickoff") {
  const ids = onboardingAttendance(row.input).kickoff.map(host => host.userId);
  // This helper also runs inside provisioning/cadence transactions, where the
  // executor is one pg client and cannot run concurrent queries.
  const people = await db.select({ userId: s.users.id, name: s.users.name, userStatus: s.users.status, membershipStatus: s.workspaceMembers.status })
      .from(s.users).leftJoin(s.workspaceMembers, and(eq(s.workspaceMembers.userId, s.users.id), eq(s.workspaceMembers.workspaceId, row.workspaceId)))
      .where(inArray(s.users.id, ids));
  const schedules = await db.select({ userId: s.schedules.userId, timezone: s.schedules.timezone, rules: s.schedules.rules, overrides: s.schedules.overrides })
      .from(s.schedules).where(inArray(s.schedules.userId, ids));
  const calendars = await db.select({ userId: s.calendarConnections.userId, conflictEnabled: s.calendarConnections.conflictEnabled,
      isWriteDestination: s.calendarConnections.isWriteDestination, syncHealthy: s.calendarConnections.syncHealthy,
      lastSyncedAt: s.calendarConnections.lastSyncedAt, fullSyncedAt: s.calendarConnections.fullSyncedAt })
      .from(s.calendarConnections).where(inArray(s.calendarConnections.userId, ids));
  return evaluateKickoffReadiness(ids.map(userId => {
    const person = people.find(person => person.userId === userId);
    return { userId, name: person?.name ?? "Unavailable participant", active: person?.userStatus === "active" && person.membershipStatus === "active",
      schedules: schedules.filter(schedule => schedule.userId === userId), calendars: calendars.filter(calendar => calendar.userId === userId) };
  }), meetingKind === "followup" ? row.input.accountLeadUserId : row.input.organizerUserId, now,
    meetingKind === "followup" ? row.input.franchiseSuccessUserIds : undefined);
}

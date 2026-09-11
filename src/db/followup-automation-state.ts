import { followupExtensionHealth } from "./followup-extension-state";
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PROTECTED_RESERVATION_WINDOW_DAYS } from "../core/engagement/kickoff-booking";
import * as s from "./schema";
type Db=NodePgDatabase<typeof s>;
export const FOLLOWUP_SCHEDULER_NAME="followup-scheduler";
export const RESERVATION_RETRY_MS=5*60_000;
function pending(now:Date) {
  return and(isNotNull(s.onboardingFollowups.enabledAt),eq(s.engagements.status,"active"),eq(s.onboardingFollowupSchedules.status,"planned"),
    eq(s.onboardingFollowupOccurrences.status,"draft"),
    or(isNull(s.followupReservations.bookingId),and(eq(s.bookings.status,"cancelled"),sql`${s.onboardingFollowupOccurrences.startsAt}>${now}`)),
    lte(s.onboardingFollowupOccurrences.endsAt,new Date(now.getTime()+PROTECTED_RESERVATION_WINDOW_DAYS*86400_000)));
}
function candidates(db:Db) {
  return db.select({occurrenceId:sql<string>`${s.onboardingFollowupOccurrences.id}`.as("occurrence_id"),onboardingId:sql<string>`${s.franchiseOnboarding.id}`.as("onboarding_id"),workspaceId:s.franchiseOnboarding.workspaceId,
    engagementId:s.franchiseOnboarding.engagementId,revision:s.franchiseOnboarding.revision,actorUserId:s.onboardingFollowups.createdByUserId,
    startsAt:s.onboardingFollowupOccurrences.startsAt,ownerUserId:s.engagements.accountLeadUserId})
    .from(s.onboardingFollowupOccurrences)
    .innerJoin(s.onboardingFollowupSchedules,eq(s.onboardingFollowupSchedules.onboardingId,s.onboardingFollowupOccurrences.onboardingId))
    .innerJoin(s.onboardingFollowups,eq(s.onboardingFollowups.onboardingId,s.onboardingFollowupOccurrences.onboardingId))
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId))
    .innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
    .leftJoin(s.followupReservations,eq(s.followupReservations.occurrenceId,s.onboardingFollowupOccurrences.id))
    .leftJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId));
}
export async function listDueFollowupReservations(db:Db,now=new Date()) {
  return candidates(db).where(and(pending(now),or(isNull(s.followupReservations.occurrenceId),sql`${s.followupReservations.status}<>'blocked'`,
    lte(s.followupReservations.updatedAt,new Date(now.getTime()-RESERVATION_RETRY_MS)))))
    .orderBy(asc(s.onboardingFollowupOccurrences.startsAt)).limit(20);
}
export async function followupAutomationHealth(workspaceId:string,db:Db,now=new Date()) {
  // SQL aggregation is deliberately uncapped; the batch limit must never hide
  // a backlog when the scheduler dies or cannot keep pace.
  const [counts]=await db.select({pending:sql<number>`count(*)::int`,overdue:sql<number>`count(*) filter(where greatest(${s.onboardingFollowupOccurrences.updatedAt},${s.onboardingFollowups.enabledAt},${s.onboardingFollowupOccurrences.endsAt} - ${PROTECTED_RESERVATION_WINDOW_DAYS} * interval '1 day') < ${new Date(now.getTime()-900_000)})::int`})
    .from(s.onboardingFollowupOccurrences)
    .innerJoin(s.onboardingFollowupSchedules,eq(s.onboardingFollowupSchedules.onboardingId,s.onboardingFollowupOccurrences.onboardingId))
    .innerJoin(s.onboardingFollowups,eq(s.onboardingFollowups.onboardingId,s.onboardingFollowupOccurrences.onboardingId))
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId))
    .innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
    .leftJoin(s.followupReservations,eq(s.followupReservations.occurrenceId,s.onboardingFollowupOccurrences.id))
    .leftJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId))
    .where(and(pending(now),eq(s.franchiseOnboarding.workspaceId,workspaceId)));
  const [active]=await db.select({id:s.onboardingFollowups.onboardingId}).from(s.onboardingFollowups)
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId))
    .innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
    .where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),isNotNull(s.onboardingFollowups.enabledAt),eq(s.engagements.status,"active"))).limit(1);
  const [heartbeat]=await db.select().from(s.kickoffDeliveryWorker).where(eq(s.kickoffDeliveryWorker.name,FOLLOWUP_SCHEDULER_NAME));
  return {...await followupExtensionHealth(workspaceId,db,now),reservationPending:counts?.pending??0,reservationOverdue:counts?.overdue??0,
    schedulerStale:!!active&&(!heartbeat||now.getTime()-heartbeat.lastSweepAt.getTime()>180_000),schedulerLastSweepAt:heartbeat?.lastSweepAt??null};
}
export type FollowupCandidate=Awaited<ReturnType<typeof listDueFollowupReservations>>[number];
export async function recordFollowupSchedulerIssue(candidate:FollowupCandidate,issueCode:string,db:Db) {
  return db.transaction(async tx=>{
    await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,candidate.workspaceId)).for("update");
    await tx.select({id:s.engagements.id}).from(s.engagements).where(eq(s.engagements.id,candidate.engagementId)).for("share");
    // A concurrently paused/changed/reserved occurrence is no longer this job.
    const [current]=await candidates(tx).where(and(pending(new Date()),eq(s.onboardingFollowupOccurrences.id,candidate.occurrenceId),eq(s.franchiseOnboarding.revision,candidate.revision)));
    if(!current)return;
    await tx.insert(s.followupReservations).values({occurrenceId:current.occurrenceId,onboardingId:current.onboardingId,status:"blocked",ownerUserId:current.ownerUserId,issueCode})
      .onConflictDoUpdate({target:s.followupReservations.occurrenceId,set:{status:"blocked",ownerUserId:current.ownerUserId,issueCode,updatedAt:new Date()}});
    await tx.insert(s.followupReservationEvents).values({occurrenceId:current.occurrenceId,actorUserId:current.actorUserId,outcome:"blocked",issueCode});
  });
}

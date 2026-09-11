import { PROTECTED_RESERVATION_WINDOW_DAYS } from "../core/engagement/kickoff-booking";
import { and, desc, eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EngagementActor } from "../core/engagement/permissions";
import { onboardingAttendance } from "../core/engagement/franchise-onboarding";
import { appendEvent } from "./booking-repo";
import { getDb } from "./client";
import { kickoffConfigurationIssue, kickoffHosts, loadKickoffContext } from "./kickoff-context";
import * as s from "./schema";
type Db=NodePgDatabase<typeof s>;
const admin=(actor:EngagementActor)=>["admin","owner"].includes(actor.workspaceRole);

export async function prepareOnboardingFollowups(workspaceId:string,actor:EngagementActor,engagementId:string,db:Db=getDb()) {
  if(!admin(actor))return {kind:"forbidden" as const};
  return db.transaction(async tx=>{
    await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId)).for("update");
    const [engagement]=await tx.select().from(s.engagements).where(and(eq(s.engagements.workspaceId,workspaceId),eq(s.engagements.id,engagementId))).for("update");
    const [onboarding]=await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
    if(!engagement||!onboarding)return {kind:"not_found" as const};
    if(["paused","completed","archived"].includes(engagement.status))return {kind:"engagement_closed" as const};
    const [existing]=await tx.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,onboarding.id));
    if(existing) {
      const ctx=await loadKickoffContext(existing.eventTypeId,tx);
      if(!ctx||await kickoffConfigurationIssue(ctx,tx))return {kind:"configuration_changed" as const};
      return {kind:"reused" as const,eventTypeId:existing.eventTypeId,enabled:!!existing.enabledAt};
    }
    const [conversation]=await tx.insert(s.eventTypes).values({workspaceId,engagementId,ownerUserId:onboarding.input.accountLeadUserId,
      slug:`onboarding-followup-${crypto.randomUUID()}`,title:`${onboarding.input.locationName} onboarding follow-up`,
      description:"Review launch progress, resolve blockers and agree the next actions with Franchise Success.",durationMinutes:45,
      mode:"group",capacity:1,rollingWindowDays:PROTECTED_RESERVATION_WINDOW_DAYS,playbookStatus:"draft",publicSelectableHostIds:[],
      purpose:"Keep franchise onboarding moving with shared progress and next steps.",
      participantRoles:[{role:"Franchise Success",required:true},{role:"Leadership",required:false},{role:"Franchisee",required:true}],
      outcomeDefinition:"Review progress, resolve blockers and confirm action owners."}).returning();
    if(!conversation)throw new Error("followup_conversation_not_created");
    await tx.insert(s.eventTypeHosts).values(onboardingAttendance(onboarding.input).followup.map(host=>({eventTypeId:conversation.id,userId:host.userId,role:host.role})));
    await tx.insert(s.onboardingFollowups).values({onboardingId:onboarding.id,eventTypeId:conversation.id,createdByUserId:actor.userId});
    return {kind:"created" as const,eventTypeId:conversation.id,enabled:false};
  });
}
class ReservationBlocked extends Error { constructor(readonly code:string){super(code);} }

/** One occurrence -> one booking. The source kickoff supplies verified person
 * details; callers cannot override recipients, hosts, dates or organizer. */
export async function reserveOnboardingFollowup(workspaceId:string,actor:EngagementActor,engagementId:string,occurrenceId:string,revision:number,db:Db=getDb()) {
  if(!admin(actor))return {kind:"forbidden" as const};
  return db.transaction(async tx=>{
    await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId)).for("update");
    const [binding]=await tx.select({eventTypeId:s.onboardingFollowups.eventTypeId}).from(s.onboardingFollowups)
      .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId))
      .where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
    if(!binding)return {kind:"not_found" as const};
    const initial=await loadKickoffContext(binding.eventTypeId,tx);if(!initial||initial.meetingKind!=="followup")return {kind:"not_found" as const};
    for(const host of [...kickoffHosts(initial)].sort())await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${host}, 0))`);
    await tx.select({id:s.engagements.id}).from(s.engagements).where(eq(s.engagements.id,engagementId)).for("update");
    const ctx=await loadKickoffContext(binding.eventTypeId,tx);if(!ctx||ctx.meetingKind!=="followup")return {kind:"not_found" as const};
    const [occurrence]=await tx.select().from(s.onboardingFollowupOccurrences).where(and(eq(s.onboardingFollowupOccurrences.id,occurrenceId),eq(s.onboardingFollowupOccurrences.onboardingId,ctx.onboarding.id))).for("update");
    if(!occurrence)return {kind:"not_found" as const};
    const [prior]=await tx.select().from(s.followupReservations).where(eq(s.followupReservations.occurrenceId,occurrenceId));
    const [priorBooking]=prior?.bookingId?await tx.select().from(s.bookings).where(eq(s.bookings.id,prior.bookingId)):[];
    if(priorBooking?.status==="confirmed")return {kind:"reused" as const,bookingId:priorBooking.id,occurrenceId};
    const owner=ctx.engagement.accountLeadUserId;
    const blocked=async(issueCode:string)=>{
      await tx.insert(s.followupReservations).values({occurrenceId,onboardingId:ctx.onboarding.id,status:"blocked",ownerUserId:owner,issueCode})
        .onConflictDoUpdate({target:s.followupReservations.occurrenceId,set:{status:"blocked",ownerUserId:owner,issueCode,updatedAt:new Date()}});
      await tx.insert(s.followupReservationEvents).values({occurrenceId,actorUserId:actor.userId,outcome:"blocked",issueCode});
      return {kind:"blocked" as const,occurrenceId,issueCode,ownerUserId:owner};
    };
    if(priorBooking) {
      const [cancellation]=await tx.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.bookingId,priorBooking.id)).orderBy(desc(s.kickoffDeliveries.sequence)).limit(1);
      if(priorBooking.status!=="cancelled" || cancellation?.kind!=="cancelled" || cancellation.status!=="delivered" || !cancellation.calendarVerifiedAt)return blocked("previous_cancellation_unverified");
    }
    if(!ctx.binding.enabledAt||!ctx.binding.kickoffBookingId)return blocked("followup_not_enabled");
    if(ctx.onboarding.revision!==revision||ctx.binding.approvedRevision!==revision)return blocked("followup_approval_stale");
    const [kickoff]=await tx.select({booking:s.bookings}).from(s.bookings).innerJoin(s.onboardingKickoffs,eq(s.onboardingKickoffs.eventTypeId,s.bookings.eventTypeId))
      .where(and(eq(s.bookings.id,ctx.binding.kickoffBookingId),eq(s.bookings.workspaceId,workspaceId),eq(s.onboardingKickoffs.onboardingId,ctx.onboarding.id)));
    if(!kickoff||kickoff.booking.status!=="confirmed"||kickoff.booking.inviteStatus!=="delivered")return blocked("kickoff_delivery_unverified");
    if(occurrence.startsAt<=new Date())return blocked("followup_occurrence_past");
    try {
      return await tx.transaction(async reservationTx=>{
        const bookingId=crypto.randomUUID();
        await reservationTx.insert(s.bookings).values({id:bookingId,workspaceId,eventTypeId:binding.eventTypeId,
          startsAt:occurrence.startsAt,endsAt:occurrence.endsAt,hostUserIds:kickoffHosts(ctx),
          inviteeEmail:kickoff.booking.inviteeEmail,inviteeName:kickoff.booking.inviteeName,inviteeTimezone:kickoff.booking.inviteeTimezone,
          guestEmails:kickoff.booking.guestEmails,meetingFormat:"google_meet",rescheduleToken:crypto.randomUUID(),cancelToken:crypto.randomUUID()});
        await reservationTx.insert(s.followupReservations).values({occurrenceId,onboardingId:ctx.onboarding.id,bookingId,status:"reserved",ownerUserId:owner})
          .onConflictDoUpdate({target:s.followupReservations.occurrenceId,set:{bookingId,status:"reserved",issueCode:null,ownerUserId:owner,updatedAt:new Date()}});
        const result=await appendEvent(bookingId,"created",{startsAt:Temporal.Instant.from(occurrence.startsAt.toISOString()),endsAt:Temporal.Instant.from(occurrence.endsAt.toISOString()),hostUserIds:kickoffHosts(ctx),guestEmails:kickoff.booking.guestEmails},reservationTx);
        if(!result.ok)throw new ReservationBlocked(result.error.reason);
        await reservationTx.insert(s.followupBookingHistory).values({bookingId,occurrenceId,revision});
        await reservationTx.insert(s.followupReservationEvents).values({occurrenceId,actorUserId:actor.userId,outcome:"reserved"});
        return {kind:"reserved" as const,bookingId,occurrenceId};
      });
    }catch(error) {
      if(error instanceof ReservationBlocked)return blocked(error.code);
      // The failed savepoint removed every partial booking/outbox write. The
      // outer transaction retains an assigned, queryable failure.
      return blocked("followup_reservation_failed");
    }
  });
}
export async function getFollowupReservations(workspaceId:string,actor:EngagementActor,engagementId:string,db:Db=getDb()) {
  if(!admin(actor))return {kind:"forbidden" as const};
  const [onboarding]=await db.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
  if(!onboarding)return {kind:"not_found" as const};
  const [binding]=await db.select({eventTypeId:s.onboardingFollowups.eventTypeId,enabledAt:s.onboardingFollowups.enabledAt}).from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,onboarding.id));
  const reservations=await db.select().from(s.followupReservations).where(eq(s.followupReservations.onboardingId,onboarding.id));
  const history=await db.select({bookingId:s.followupBookingHistory.bookingId,occurrenceId:s.followupBookingHistory.occurrenceId,revision:s.followupBookingHistory.revision,status:s.bookings.status}).from(s.followupBookingHistory)
    .innerJoin(s.onboardingFollowupOccurrences,eq(s.onboardingFollowupOccurrences.id,s.followupBookingHistory.occurrenceId))
    .innerJoin(s.bookings,eq(s.bookings.id,s.followupBookingHistory.bookingId))
    .where(eq(s.onboardingFollowupOccurrences.onboardingId,onboarding.id));
  return {kind:"found" as const,history,eventTypeId:binding?.eventTypeId??null,enabled:!!binding?.enabledAt,reservations,attention:reservations.filter(row=>row.status==="blocked").length};
}

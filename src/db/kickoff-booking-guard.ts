import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { PROTECTED_RESERVATION_WINDOW_DAYS, sameRoster, type KickoffBookingError } from "../core/engagement/kickoff-booking";
import { effectiveOpenIntervals } from "../core/availability/overrides";
import { subtract, type Interval } from "../core/availability/intervals";
import { generateSlots } from "../core/availability/slots";
import { kickoffConfigurationIssue, kickoffHosts, loadKickoffContext, lockKickoffContext, readinessKind } from "./kickoff-context";
import { getKickoffReadiness } from "./kickoff-readiness-repo";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;

/** Call inside the transaction that writes the hold/booking. Availability is
 * re-read here; a public page or earlier hold is not evidence of current safety. */
export async function guardKickoffBooking(eventTypeId: string, hostIds: readonly string[], slot: Interval, db: Db, excludeBookingId?: string, managedRequestId?: string, purpose: "hold"|"booking" = "booking"): Promise<
  {kind:"unprotected"} | {kind:"allowed";hostUserIds:string[]} | {kind:"blocked";error:KickoffBookingError}
> {
  const initial=await loadKickoffContext(eventTypeId,db);
  if(!initial)return {kind:"unprotected"};
  for(const id of [...kickoffHosts(initial)].sort())await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
  const ctx=(await lockKickoffContext(eventTypeId,db))!;
  const blocked=(error:KickoffBookingError)=>({kind:"blocked" as const,error});
  if(ctx.meetingKind==="followup") {
    if(!ctx.binding.enabledAt || !ctx.binding.kickoffBookingId)return blocked("followup_not_enabled");
    if(ctx.binding.approvedRevision!==ctx.onboarding.revision)return blocked("followup_approval_stale");
    const [linked]=excludeBookingId?await db.select({occurrence:s.onboardingFollowupOccurrences,schedule:s.onboardingFollowupSchedules})
      .from(s.followupReservations).innerJoin(s.onboardingFollowupOccurrences,eq(s.onboardingFollowupOccurrences.id,s.followupReservations.occurrenceId))
      .innerJoin(s.onboardingFollowupSchedules,eq(s.onboardingFollowupSchedules.onboardingId,s.onboardingFollowupOccurrences.onboardingId))
      .where(and(eq(s.followupReservations.bookingId,excludeBookingId),eq(s.followupReservations.onboardingId,ctx.onboarding.id))):[];
    if(!linked || linked.schedule.status!=="planned" || linked.occurrence.status!=="draft"
      || linked.occurrence.startsAt.getTime()!==slot.start.epochMilliseconds || linked.occurrence.endsAt.getTime()!==slot.end.epochMilliseconds)return blocked("followup_occurrence_mismatch");
  }
  if(!ctx.binding.publishedAt || ctx.eventType.playbookStatus!=="ready")return blocked("kickoff_not_published");
  if(ctx.engagement.status!=="active")return blocked("kickoff_engagement_inactive");
  const configIssue=await kickoffConfigurationIssue(ctx,db);
  if(configIssue)return blocked(configIssue);
  // Holds also support rescheduling. Enforce the single kickoff when confirming
  // a booking, under the same host/context locks used by both confirmations.
  // The check-in is a single protected booking too.
  if(ctx.meetingKind!=="followup" && purpose==="booking") {
    const [existing]=await db.select({id:s.bookings.id}).from(s.bookings)
      .where(and(eq(s.bookings.eventTypeId,eventTypeId),eq(s.bookings.workspaceId,ctx.onboarding.workspaceId),eq(s.bookings.status,"confirmed"),...(excludeBookingId?[ne(s.bookings.id,excludeBookingId)]:[]))).limit(1);
    if(existing)return blocked("kickoff_already_booked");
  }
  const required=kickoffHosts(ctx);
  if(!sameRoster(hostIds,required))return blocked("kickoff_roster_mismatch");
  const now=Temporal.Now.instant();
  if(!(await getKickoffReadiness(ctx.onboarding,db,new Date(now.epochMilliseconds),readinessKind(ctx.meetingKind))).calendarSetupReady)return blocked("kickoff_setup_incomplete");
  if(slot.end.epochMilliseconds>now.epochMilliseconds+PROTECTED_RESERVATION_WINDOW_DAYS*86400_000)return blocked("kickoff_calendar_coverage_incomplete");
  const event=ctx.eventType;
  if(slot.start.until(slot.end).total({unit:"minutes"})!==event.durationMinutes)return blocked("kickoff_slot_unavailable");
  const window={start:slot.start.subtract({minutes:event.bufferBeforeMin}),end:slot.end.add({minutes:event.bufferAfterMin})};
  const start=new Date(window.start.epochMilliseconds),end=new Date(window.end.epochMilliseconds);
  const schedules=await db.select().from(s.schedules).where(inArray(s.schedules.userId,required));
  const [previous]=excludeBookingId?await db.select({googleEventId:s.bookings.googleEventId}).from(s.bookings)
    .where(and(eq(s.bookings.id,excludeBookingId),eq(s.bookings.eventTypeId,eventTypeId))):[];
  const cached=await db.select({userId:s.calendarConnections.userId,startsAt:s.calendarBusyCache.startsAt,endsAt:s.calendarBusyCache.endsAt,externalEventId:s.calendarBusyCache.externalEventId,lastSyncedAt:s.calendarConnections.lastSyncedAt})
    .from(s.calendarBusyCache).innerJoin(s.calendarConnections,eq(s.calendarConnections.id,s.calendarBusyCache.connectionId))
    .where(and(inArray(s.calendarConnections.userId,required),eq(s.calendarConnections.conflictEnabled,true),lt(s.calendarBusyCache.startsAt,end),gte(s.calendarBusyCache.endsAt,start)));
  // A reviewed batch can move dates into slots that another changed booking
  // is leaving in this same transaction. Ignore only those audited old slots.
  const releasedBookingIds=new Set<string>();
  const releasedEventIds=new Set<string>();
  if(ctx.meetingKind==="followup" && managedRequestId) {
    const [review]=await db.select().from(s.onboardingFollowupChanges).where(and(eq(s.onboardingFollowupChanges.onboardingId,ctx.onboarding.id),eq(s.onboardingFollowupChanges.requestId,managedRequestId),eq(s.onboardingFollowupChanges.revision,ctx.onboarding.revision)));
    const ids=review?.changes.filter(row=>row.id&&["move","cancel","pause"].includes(row.action)).map(row=>row.id!)??[];
    if(ids.length)for(const row of await db.select({id:s.bookings.id,eventId:s.bookings.googleEventId}).from(s.followupReservations)
      .innerJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId))
      .where(and(eq(s.followupReservations.onboardingId,ctx.onboarding.id),inArray(s.followupReservations.occurrenceId,ids)))) {
        releasedBookingIds.add(row.id);if(row.eventId)releasedEventIds.add(row.eventId);
    }
  }
  // A cached old time may persist until the next Google sync. Only a newer
  // durable move/cancellation can supersede it; a refreshed cache wins again.
  const operations=ctx.meetingKind==="followup"?await db.select({bookingId:s.kickoffDeliveries.bookingId,eventId:s.kickoffDeliveries.googleEventId,kind:s.kickoffDeliveries.kind,verifiedAt:s.kickoffDeliveries.calendarVerifiedAt,status:s.kickoffDeliveries.status})
    .from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.onboardingId,ctx.onboarding.id),inArray(s.kickoffDeliveries.kind,["created","rescheduled","cancelled"]))).orderBy(desc(s.kickoffDeliveries.sequence)):[];
  const latestOperations=new Map<string,typeof operations[number]>();for(const row of operations)if(!latestOperations.has(row.bookingId))latestOperations.set(row.bookingId,row);
  const cacheSuperseded=(row:typeof cached[number])=>!!row.externalEventId && (releasedEventIds.has(row.externalEventId)||[...latestOperations.values()].some(op=>op.eventId===row.externalEventId&&["rescheduled","cancelled"].includes(op.kind)&&op.status!=="superseded"&&(!op.verifiedAt||!row.lastSyncedAt||row.lastSyncedAt<op.verifiedAt)));
  const bookings=await db.select({id:s.bookings.id,hostIds:s.bookings.hostUserIds,startsAt:s.bookings.startsAt,endsAt:s.bookings.endsAt}).from(s.bookings)
    .where(and(eq(s.bookings.status,"confirmed"),lt(s.bookings.startsAt,end),gte(s.bookings.endsAt,start),...(excludeBookingId?[ne(s.bookings.id,excludeBookingId)]:[])));
  // The follow-up path reserves without public holds, so it must respect
  // active holds belonging to any other booking flow as well as bookings.
  const held=ctx.meetingKind==="followup"?await db.select().from(s.holds).where(and(inArray(s.holds.hostUserId,required),eq(s.holds.status,"active"),
    gte(s.holds.expiresAt,new Date(now.epochMilliseconds)),lt(s.holds.slotStart,end),gte(s.holds.slotEnd,start))):[];
  const interval=(row:{startsAt:Date;endsAt:Date})=>({start:Temporal.Instant.fromEpochMilliseconds(row.startsAt.getTime()),end:Temporal.Instant.fromEpochMilliseconds(row.endsAt.getTime())});
  for(const id of required) {
    const schedule=schedules.find(row=>row.userId===id);
    if(!schedule)return blocked("kickoff_setup_incomplete");
    const busy=[...cached.filter(row=>row.userId===id && (!previous?.googleEventId || row.externalEventId!==previous.googleEventId) && !cacheSuperseded(row)).map(interval),
      ...bookings.filter(row=>row.hostIds.includes(id)&&!releasedBookingIds.has(row.id)).map(interval),
      ...held.filter(row=>row.hostUserId===id).map(row=>interval({startsAt:row.slotStart,endsAt:row.slotEnd}))];
    const open=effectiveOpenIntervals(schedule.rules,schedule.overrides,schedule.timezone,window);
    const slots=generateSlots(subtract(open,busy),{durationMinutes:event.durationMinutes,bufferBeforeMin:event.bufferBeforeMin,
      bufferAfterMin:event.bufferAfterMin,minimumNoticeMin:event.minimumNoticeMin,rollingWindowDays:event.rollingWindowDays,
      maxPerDay:event.maxPerDay??undefined,timezone:schedule.timezone},now);
    if(!slots.some(candidate=>candidate.start.equals(slot.start)&&candidate.end.equals(slot.end)))return blocked("kickoff_slot_unavailable");
  }
  return {kind:"allowed",hostUserIds:required};
}

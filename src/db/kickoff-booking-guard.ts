import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { sameRoster, type KickoffBookingError } from "../core/engagement/kickoff-booking";
import { effectiveOpenIntervals } from "../core/availability/overrides";
import { subtract, type Interval } from "../core/availability/intervals";
import { generateSlots } from "../core/availability/slots";
import { kickoffConfigurationIssue, kickoffHosts, loadKickoffContext, lockKickoffContext } from "./kickoff-context";
import { getKickoffReadiness } from "./kickoff-readiness-repo";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;

/** Call inside the transaction that writes the hold/booking. Availability is
 * re-read here; a public page or earlier hold is not evidence of current safety. */
export async function guardKickoffBooking(eventTypeId: string, hostIds: readonly string[], slot: Interval, db: Db, excludeBookingId?: string): Promise<
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
  const required=kickoffHosts(ctx);
  if(!sameRoster(hostIds,required))return blocked("kickoff_roster_mismatch");
  const now=Temporal.Now.instant();
  if(!(await getKickoffReadiness(ctx.onboarding,db,new Date(now.epochMilliseconds),ctx.meetingKind)).calendarSetupReady)return blocked("kickoff_setup_incomplete");
  const event=ctx.eventType;
  if(slot.start.until(slot.end).total({unit:"minutes"})!==event.durationMinutes)return blocked("kickoff_slot_unavailable");
  const window={start:slot.start.subtract({minutes:event.bufferBeforeMin}),end:slot.end.add({minutes:event.bufferAfterMin})};
  const start=new Date(window.start.epochMilliseconds),end=new Date(window.end.epochMilliseconds);
  const schedules=await db.select().from(s.schedules).where(inArray(s.schedules.userId,required));
  const [previous]=excludeBookingId?await db.select({googleEventId:s.bookings.googleEventId}).from(s.bookings)
    .where(and(eq(s.bookings.id,excludeBookingId),eq(s.bookings.eventTypeId,eventTypeId))):[];
  const cached=await db.select({userId:s.calendarConnections.userId,startsAt:s.calendarBusyCache.startsAt,endsAt:s.calendarBusyCache.endsAt,externalEventId:s.calendarBusyCache.externalEventId})
    .from(s.calendarBusyCache).innerJoin(s.calendarConnections,eq(s.calendarConnections.id,s.calendarBusyCache.connectionId))
    .where(and(inArray(s.calendarConnections.userId,required),eq(s.calendarConnections.conflictEnabled,true),lt(s.calendarBusyCache.startsAt,end),gte(s.calendarBusyCache.endsAt,start)));
  const bookings=await db.select({hostIds:s.bookings.hostUserIds,startsAt:s.bookings.startsAt,endsAt:s.bookings.endsAt}).from(s.bookings)
    .where(and(eq(s.bookings.status,"confirmed"),lt(s.bookings.startsAt,end),gte(s.bookings.endsAt,start),...(excludeBookingId?[ne(s.bookings.id,excludeBookingId)]:[])));
  // The follow-up path reserves without public holds, so it must respect
  // active holds belonging to any other booking flow as well as bookings.
  const held=ctx.meetingKind==="followup"?await db.select().from(s.holds).where(and(inArray(s.holds.hostUserId,required),eq(s.holds.status,"active"),
    gte(s.holds.expiresAt,new Date(now.epochMilliseconds)),lt(s.holds.slotStart,end),gte(s.holds.slotEnd,start))):[];
  const interval=(row:{startsAt:Date;endsAt:Date})=>({start:Temporal.Instant.fromEpochMilliseconds(row.startsAt.getTime()),end:Temporal.Instant.fromEpochMilliseconds(row.endsAt.getTime())});
  for(const id of required) {
    const schedule=schedules.find(row=>row.userId===id);
    if(!schedule)return blocked("kickoff_setup_incomplete");
    const busy=[...cached.filter(row=>row.userId===id && (!previous?.googleEventId || row.externalEventId!==previous.googleEventId)).map(interval),
      ...bookings.filter(row=>row.hostIds.includes(id)).map(interval),
      ...held.filter(row=>row.hostUserId===id).map(row=>interval({startsAt:row.slotStart,endsAt:row.slotEnd}))];
    const open=effectiveOpenIntervals(schedule.rules,schedule.overrides,schedule.timezone,window);
    const slots=generateSlots(subtract(open,busy),{durationMinutes:event.durationMinutes,bufferBeforeMin:event.bufferBeforeMin,
      bufferAfterMin:event.bufferAfterMin,minimumNoticeMin:event.minimumNoticeMin,rollingWindowDays:event.rollingWindowDays,
      maxPerDay:event.maxPerDay??undefined,timezone:schedule.timezone},now);
    if(!slots.some(candidate=>candidate.start.equals(slot.start)&&candidate.end.equals(slot.end)))return blocked("kickoff_slot_unavailable");
  }
  return {kind:"allowed",hostUserIds:required};
}

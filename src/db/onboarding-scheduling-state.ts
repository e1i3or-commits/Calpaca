import { createHash } from "node:crypto";
import { and,asc,desc,eq,inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schedulingRuntime,type SchedulingRuntime } from "../core/engagement/onboarding-publication";
import { kickoffConfigurationIssue,loadKickoffContext } from "./kickoff-context";
import { getKickoffReadiness } from "./kickoff-readiness-repo";
import { onboardingAutomationActor } from "./onboarding-automation-actor";
import * as s from "./schema";
type Db=NodePgDatabase<typeof s>;
async function kickoffUrl(origin:string,workspaceId:string,eventSlug:string,db:Db) {
  if(process.env.CALPACA_DEPLOYMENT_MODE!=="hosted")return `${origin}/book/${encodeURIComponent(eventSlug)}`;
  const [workspace]=await db.select({slug:s.workspaces.slug}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId));
  return workspace?`${origin}/book/${encodeURIComponent(workspace.slug)}/${encodeURIComponent(eventSlug)}`:null;
}
export const schedulingHash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Caller authorizes Engagement access. This projection contains no invitee email,
 * OAuth credentials or calendar IDs. */
export async function onboardingSchedulingState(row:typeof s.franchiseOnboarding.$inferSelect,db:Db,runtime:SchedulingRuntime=schedulingRuntime(),now=new Date()) {
  const [engagement]=await db.select().from(s.engagements).where(and(eq(s.engagements.id,row.engagementId),eq(s.engagements.workspaceId,row.workspaceId)));
  const [kickoff]=await db.select().from(s.onboardingKickoffs).where(eq(s.onboardingKickoffs.onboardingId,row.id));
  const [followup]=await db.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,row.id));
  const [schedule]=await db.select().from(s.onboardingFollowupSchedules).where(eq(s.onboardingFollowupSchedules.onboardingId,row.id));
  const dates=await db.select({id:s.onboardingFollowupOccurrences.id,position:s.onboardingFollowupOccurrences.position,startsAt:s.onboardingFollowupOccurrences.startsAt,endsAt:s.onboardingFollowupOccurrences.endsAt,status:s.onboardingFollowupOccurrences.status})
    .from(s.onboardingFollowupOccurrences).where(eq(s.onboardingFollowupOccurrences.onboardingId,row.id)).orderBy(asc(s.onboardingFollowupOccurrences.position));
  const heartbeats=await db.select().from(s.kickoffDeliveryWorker).where(inArray(s.kickoffDeliveryWorker.name,["dispatcher","followup-scheduler","ses-feedback"]));
  const common=[...runtime.issues];
  for(const [name,code] of [["dispatcher","dispatcher_stale"],["followup-scheduler","scheduler_stale"],["ses-feedback","feedback_stale"]]) {
    const stamp=heartbeats.find(worker=>worker.name===name)?.lastSweepAt;
    if(!stamp || stamp>now || now.getTime()-stamp.getTime()>180_000)common.push(code!);
  }
  if(!engagement || ["paused","completed","archived"].includes(engagement.status))common.push("engagement_closed");
  const kickoffContext=kickoff?await loadKickoffContext(kickoff.eventTypeId,db):null;
  const followupContext=followup?await loadKickoffContext(followup.eventTypeId,db):null;
  const kickoffIssues=[...common],followupIssues=[...common];
  if(!kickoffContext)kickoffIssues.push("kickoff_not_prepared");
  else if(await kickoffConfigurationIssue(kickoffContext,db))kickoffIssues.push("kickoff_configuration_changed");
  const kickoffReady=await getKickoffReadiness(row,db,now);
  if(!kickoffReady.calendarSetupReady)kickoffIssues.push("calendar_setup_incomplete");
  if(!followupContext)followupIssues.push("followup_not_prepared");
  else if(await kickoffConfigurationIssue(followupContext,db))followupIssues.push("followup_configuration_changed");
  if(!(await getKickoffReadiness(row,db,now,"followup")).calendarSetupReady)followupIssues.push("calendar_setup_incomplete");
  if(followup && !await onboardingAutomationActor(row.workspaceId,followup.createdByUserId,db))followupIssues.push("automation_identity_unavailable");
  const bookings=kickoff?await db.select().from(s.bookings).where(and(eq(s.bookings.eventTypeId,kickoff.eventTypeId),eq(s.bookings.workspaceId,row.workspaceId),eq(s.bookings.status,"confirmed"))).orderBy(asc(s.bookings.startsAt)):[];
  const eligibleKickoffs=[];
  for(const booking of bookings) {
    const [delivery]=await db.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.bookingId,booking.id),inArray(s.kickoffDeliveries.kind,["created","rescheduled","cancelled"]))).orderBy(desc(s.kickoffDeliveries.sequence)).limit(1);
    if(booking.inviteStatus==="delivered" && delivery?.status==="delivered" && delivery.kind!=="cancelled" && delivery.calendarVerifiedAt)eligibleKickoffs.push({id:booking.id,startsAt:booking.startsAt.toISOString(),endsAt:booking.endsAt.toISOString()});
  }
  if(!eligibleKickoffs.length)followupIssues.push("kickoff_delivery_unverified");
  const planned=dates.filter(date=>date.status!=="cancelled");
  if(!schedule)followupIssues.push("followup_schedule_missing");
  else if(schedule.status!=="planned")followupIssues.push("followup_schedule_not_planned");
  if(schedule && !followup?.enabledAt && (!planned.length || planned.some(date=>date.status!=="draft" || date.startsAt<=now || date.endsAt.getTime()-date.startsAt.getTime()!==45*60_000)))followupIssues.push("followup_dates_invalid");
  const published=!!kickoff?.publishedAt;
  const available=published && engagement?.status==="active" && kickoffContext?.eventType.playbookStatus==="ready" && kickoffReady.calendarSetupReady && !kickoffIssues.includes("kickoff_configuration_changed");
  const kickoffBookingUrl=available && runtime.publicOrigin?await kickoffUrl(runtime.publicOrigin,row.workspaceId,kickoffContext!.eventType.slug,db):null;
  return {revision:row.revision,checkedAt:now.toISOString(),
    kickoff:{prepared:!!kickoff,published,available:!!kickoffBookingUrl,kickoffBookingUrl,issues:kickoffIssues},
    followups:{prepared:!!followup,enabled:!!followup?.enabledAt,approvedRevision:followup?.approvedRevision??null,kickoffBookingId:followup?.kickoffBookingId??null,
      issues:followupIssues,timezone:schedule?.rule.timezone??null,eligibleKickoffs,dates:planned.map(date=>({id:date.id,startsAt:date.startsAt.toISOString(),endsAt:date.endsAt.toISOString()})),
      previewHash:schedulingHash({revision:row.revision,rule:schedule?.rule??null,status:schedule?.status??null,dates,eligibleKickoffs})}};
}
export type OnboardingSchedulingState=Awaited<ReturnType<typeof onboardingSchedulingState>>;

export async function onboardingPublicationSummary(row:typeof s.franchiseOnboarding.$inferSelect,db:Db) {
  const [kickoff]=await db.select().from(s.onboardingKickoffs).where(eq(s.onboardingKickoffs.onboardingId,row.id));
  const [followup]=await db.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,row.id));
  const context=kickoff?await loadKickoffContext(kickoff.eventTypeId,db):null;
  const available=!!kickoff?.publishedAt && context?.engagement.status==="active" && context.eventType.playbookStatus==="ready"
    && !await kickoffConfigurationIssue(context,db) && (await getKickoffReadiness(row,db)).calendarSetupReady;
  const origin=schedulingRuntime().publicOrigin;
  const kickoffBookingUrl=available&&origin?await kickoffUrl(origin,row.workspaceId,context!.eventType.slug,db):null;
  return {kickoffBookingUrl,schedulingState:!kickoff?.publishedAt?"not_published" as const:kickoffBookingUrl?"published" as const:"unavailable" as const,
    followupsEnabled:!!followup?.enabledAt,
    issues:[...(!kickoffBookingUrl?[kickoff?.publishedAt?"kickoff_booking_unavailable":"kickoff_booking_not_published"]:[]),...(!followup?.enabledAt?["followup_scheduler_not_configured"]:[])]};
}

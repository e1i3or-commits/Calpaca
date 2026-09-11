import { hasFollowupReservations } from "./followup-reservation-state";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { followupApplyInput, followupPreviewInput, previewSchedule, type FollowupApplyInput, type FollowupPreviewInput, type ScheduleSnapshot } from "../core/engagement/followup-schedule";
import type { EngagementActor } from "../core/engagement/permissions";
import { getDb } from "./client";
import { getEngagement } from "./engagement-repo";
import * as s from "./schema";
import { kickoffHosts, loadKickoffContext } from "./kickoff-context";
import { FollowupReconciliationBlocked, reconcileFollowupChanges } from "./followup-reconciliation";
type Db = NodePgDatabase<typeof s>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",") + "}";
  return JSON.stringify(value);
}

async function load(workspaceId: string, actor: EngagementActor, engagementId: string, db: Db) {
  const engagement = await getEngagement(workspaceId, actor, engagementId, db);
  if (!engagement) return null;
  const [onboarding] = await db.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
  if (!onboarding) return null;
  const [schedule] = await db.select().from(s.onboardingFollowupSchedules).where(eq(s.onboardingFollowupSchedules.onboardingId,onboarding.id));
  const rows = schedule ? await db.select().from(s.onboardingFollowupOccurrences).where(eq(s.onboardingFollowupOccurrences.onboardingId,onboarding.id)).orderBy(asc(s.onboardingFollowupOccurrences.position)) : [];
  const reservations=await db.select({occurrenceId:s.followupReservations.occurrenceId,bookingId:s.followupReservations.bookingId,reservationStatus:s.followupReservations.status,issueCode:s.followupReservations.issueCode,ownerUserId:s.followupReservations.ownerUserId,inviteStatus:s.bookings.inviteStatus,bookingStatus:s.bookings.status})
    .from(s.followupReservations).leftJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId)).where(eq(s.followupReservations.onboardingId,onboarding.id));
  const deliveries=await db.select({bookingId:s.kickoffDeliveries.bookingId,status:s.kickoffDeliveries.status,kind:s.kickoffDeliveries.kind}).from(s.kickoffDeliveries)
    .where(eq(s.kickoffDeliveries.onboardingId,onboarding.id)).orderBy(desc(s.kickoffDeliveries.sequence));
  const snapshot: ScheduleSnapshot = {revision: onboarding.revision, engagementStatus: engagement.status, canManage: engagement.canManage,
    extensionIssue:schedule?.extensionIssueCode?{code:schedule.extensionIssueCode,ownerUserId:schedule.extensionOwnerUserId}:null,
    deliveryState: reservations.some(row=>row.bookingId) ? "reservations_present" : "not_invited",
    schedule: schedule ? {status: schedule.status, rule: schedule.rule, nextRecurrenceIndex:schedule.nextRecurrenceIndex, occurrences: rows.map(row => {
      const reservation=reservations.find(item=>item.occurrenceId===row.id);
      const delivery=deliveries.find(item=>item.bookingId===reservation?.bookingId);
      return {id:row.id,position:row.position,startsAt:row.startsAt.toISOString(),endsAt:row.endsAt.toISOString(),status:row.status,exception:row.exception,
        ...(reservation?.reservationStatus==="blocked"&&row.status==="draft"?{reservationIssue:{code:reservation.issueCode??"followup_reservation_failed",ownerUserId:reservation.ownerUserId}}:{}),
        ...(reservation?.bookingId?{bookingId:reservation.bookingId,inviteStatus:reservation.inviteStatus!,bookingStatus:reservation.bookingStatus!,
          ...(delivery?{deliveryStatus:delivery.status,deliveryKind:delivery.kind}:{})}:{})};
    })} : null};
  return {onboarding, snapshot};
}
async function lock(workspaceId: string, engagementId: string, db: Db, write: boolean) {
  if (write) {
    await db.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId)).for("update");
    const [binding]=await db.select({eventTypeId:s.onboardingFollowups.eventTypeId}).from(s.onboardingFollowups)
      .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId))
      .where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
    const context=binding?await loadKickoffContext(binding.eventTypeId,db):null;
    if(context)for(const host of [...kickoffHosts(context)].sort())await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${host},0))`);
  }
  await db.select({id:s.engagements.id}).from(s.engagements).where(and(eq(s.engagements.workspaceId,workspaceId),eq(s.engagements.id,engagementId))).for(write ? "update" : "share");
}
function allowed(snapshot: ScheduleSnapshot) {
  if (!snapshot.canManage) return "forbidden" as const;
  if (["archived","completed"].includes(snapshot.engagementStatus)) return "engagement_closed" as const;
  if (snapshot.engagementStatus === "paused") return "engagement_paused" as const;
  return null;
}
function makePreview(snapshot: ScheduleSnapshot, input: FollowupPreviewInput, now: Date) {
  const preview = previewSchedule(snapshot.schedule,input.command,now.toISOString());
  const previewHash = createHash("sha256").update(canonical({snapshot,input,preview})).digest("hex");
  return {preview,previewHash};
}
export async function getFollowupSchedule(workspaceId:string,actor:EngagementActor,engagementId:string,db:Db=getDb()) {
  return db.transaction(async tx => {
    await lock(workspaceId,engagementId,tx,false);
    const result=await load(workspaceId,actor,engagementId,tx);
    return result ? {kind:"found" as const, ...result.snapshot} : {kind:"not_found" as const};
  });
}
export async function previewFollowupSchedule(workspaceId:string,actor:EngagementActor,engagementId:string,raw:FollowupPreviewInput,db:Db=getDb(),now=new Date()) {
  const input=followupPreviewInput.safeParse(raw); if(!input.success)return {kind:"invalid_input" as const};
  return db.transaction(async tx => {
    await lock(workspaceId,engagementId,tx,false);
    const result=await load(workspaceId,actor,engagementId,tx);if(!result)return {kind:"not_found" as const};
    const denied=allowed(result.snapshot);if(denied)return {kind:denied};
    if(result.snapshot.revision!==input.data.revision)return {kind:"revision_conflict" as const};
    return {kind:"previewed" as const,...makePreview(result.snapshot,input.data,now)};
  });
}
export async function applyFollowupSchedule(workspaceId:string,actor:EngagementActor,engagementId:string,raw:FollowupApplyInput,db:Db=getDb(),now=new Date()) {
  const input=followupApplyInput.safeParse(raw);if(!input.success)return {kind:"invalid_input" as const};
  const value=input.data;
  return db.transaction(async tx => {
    await lock(workspaceId,engagementId,tx,true);
    const result=await load(workspaceId,actor,engagementId,tx);if(!result)return {kind:"not_found" as const};
    if(!result.snapshot.canManage)return {kind:"forbidden" as const};
    const [prior]=await tx.select().from(s.onboardingFollowupChanges).where(and(eq(s.onboardingFollowupChanges.onboardingId,result.onboarding.id),eq(s.onboardingFollowupChanges.requestId,value.requestId)));
    if(prior)return canonical(prior.input)===canonical(value) ? {kind:"reused" as const,appliedRevision:prior.revision,...result.snapshot} : {kind:"request_conflict" as const};
    const denied=allowed(result.snapshot);if(denied)return {kind:denied};
    if(result.snapshot.revision!==value.revision)return {kind:"revision_conflict" as const};
    const {preview,previewHash}=makePreview(result.snapshot,{revision:value.revision,command:value.command},now);
    if(value.previewHash!==previewHash)return {kind:"preview_changed" as const};
    if(!preview.canApply||!preview.rule)return {kind:"schedule_invalid" as const,issues:preview.issues};
    const onboardingId=result.onboarding.id,revision=result.onboarding.revision+1;
    await tx.insert(s.onboardingFollowupSchedules).values({onboardingId,status:preview.status,rule:preview.rule,nextRecurrenceIndex:preview.nextRecurrenceIndex??preview.rule.count,updatedAt:now})
      .onConflictDoUpdate({target:s.onboardingFollowupSchedules.onboardingId,set:{status:preview.status,rule:preview.rule,nextRecurrenceIndex:preview.nextRecurrenceIndex??preview.rule.count,extensionCheckedAt:null,updatedAt:now}});
    for(const row of preview.changes) {
      if(row.action==="keep")continue;
      const values={startsAt:new Date(row.startsAt),endsAt:new Date(row.endsAt),status:row.status,exception:row.exception,updatedAt:now};
      if(row.id)await tx.update(s.onboardingFollowupOccurrences).set(values).where(and(eq(s.onboardingFollowupOccurrences.onboardingId,onboardingId),eq(s.onboardingFollowupOccurrences.id,row.id)));
      else await tx.insert(s.onboardingFollowupOccurrences).values({...values,onboardingId,position:row.position});
    }
    await tx.update(s.franchiseOnboarding).set({revision,cadence:preview.rule.cadence,updatedAt:now}).where(eq(s.franchiseOnboarding.id,onboardingId));
    await tx.insert(s.franchiseOnboardingChanges).values({workspaceId,onboardingId,actorUserId:actor.userId,revision,kind:`followup_${value.command.action}`,cadence:preview.rule.cadence});
    await tx.insert(s.onboardingFollowupChanges).values({onboardingId,requestId:value.requestId,actorUserId:actor.userId,revision,input:value,changes:preview.changes});
    const [binding]=await tx.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,onboardingId));
    if(!binding?.enabledAt && await hasFollowupReservations(onboardingId,tx))throw new FollowupReconciliationBlocked("Calendar changes require the enabled schedule binding. Restore that configuration before editing issued dates.");
    if(binding?.enabledAt) {
      if(binding.approvedRevision!==value.revision)throw new FollowupReconciliationBlocked("The previous schedule approval is out of date. Review the current plan before issuing calendar changes.");
      await tx.update(s.onboardingFollowups).set({approvedRevision:revision}).where(eq(s.onboardingFollowups.onboardingId,onboardingId));
      await reconcileFollowupChanges(onboardingId,value.requestId,preview.changes,actor.userId,tx);
    }
    await tx.update(s.engagements).set({updatedAt:now}).where(eq(s.engagements.id,engagementId));
    const updated=await load(workspaceId,actor,engagementId,tx);
    return {kind:"applied" as const,appliedRevision:revision,...updated!.snapshot};
  }).catch((error:unknown)=>{
    if(error instanceof FollowupReconciliationBlocked)return {kind:"calendar_reconciliation_blocked" as const,issues:[error.message]};
    throw error;
  });
}

import { and,eq,sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { publishOnboardingInput,enableFollowupsInput,schedulingRuntime,type SchedulingRuntime } from "../core/engagement/onboarding-publication";
import type { EngagementActor } from "../core/engagement/permissions";
import { getEngagement } from "./engagement-repo";
import { getDb } from "./client";
import { onboardingSchedulingState,schedulingHash } from "./onboarding-scheduling-state";
import { onboardingAutomationActor } from "./onboarding-automation-actor";
import * as s from "./schema";
type Db=NodePgDatabase<typeof s>;
type PublishInput=z.infer<typeof publishOnboardingInput>;
type EnableInput=z.infer<typeof enableFollowupsInput>;
export async function getOnboardingScheduling(workspaceId:string,actor:EngagementActor,engagementId:string,db:Db=getDb(),runtime:SchedulingRuntime=schedulingRuntime()) {
  const engagement=await getEngagement(workspaceId,actor,engagementId,db);if(!engagement)return {kind:"not_found" as const};
  const [row]=await db.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
  if(!row)return {kind:"not_found" as const};
  const state=await onboardingSchedulingState(row,db,runtime);
  return {kind:"found" as const,...state,canPublish:["admin","owner"].includes(actor.workspaceRole),canEnable:engagement.canManage};
}
async function change(workspaceId:string,actor:EngagementActor,engagementId:string,action:"publish_kickoff"|"enable_followups",input:PublishInput|EnableInput,db:Db,runtime:SchedulingRuntime) {
  return db.transaction(async tx=>{
    await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId)).for("update");
    const [row]=await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.franchiseOnboarding.engagementId,engagementId)));
    if(!row)return {kind:"not_found" as const};
    // Use the same workspace -> host -> Engagement order as reservation/change paths.
    for(const host of [...row.input.franchiseSuccessUserIds,row.input.kaiUserId,row.input.andrewUserId].sort())await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${host},0))`);
    await tx.select({id:s.engagements.id}).from(s.engagements).where(and(eq(s.engagements.id,engagementId),eq(s.engagements.workspaceId,workspaceId))).for("update");
    await tx.select({id:s.eventTypes.id}).from(s.eventTypes).where(and(eq(s.eventTypes.workspaceId,workspaceId),eq(s.eventTypes.engagementId,engagementId))).for("update");
    const engagement=await getEngagement(workspaceId,actor,engagementId,tx);
    if(!engagement)return {kind:"not_found" as const};
    if(!engagement.canManage || (action==="publish_kickoff" && !await onboardingAutomationActor(workspaceId,actor.userId,tx)))return {kind:"forbidden" as const};
    const inputHash=schedulingHash({action,engagementId,...input});
    const [prior]=await tx.select().from(s.onboardingSchedulingActions).where(and(eq(s.onboardingSchedulingActions.workspaceId,workspaceId),eq(s.onboardingSchedulingActions.requestId,input.requestId)));
    if(prior) {
      if(prior.inputHash!==inputHash)return {kind:"request_conflict" as const};
      return {kind:"reused" as const,state:await onboardingSchedulingState(row,tx,runtime)};
    }
    if(row.revision!==input.revision)return {kind:"revision_conflict" as const};
    const state=await onboardingSchedulingState(row,tx,runtime);
    const already=action==="publish_kickoff"?state.kickoff.published:state.followups.enabled;
    if(already)return {kind:"already_enabled" as const,state};
    const issues=action==="publish_kickoff"?state.kickoff.issues:state.followups.issues;
    if(issues.length)return {kind:"blocked" as const,issues};
    if(action==="enable_followups") {
      const enable=input as EnableInput;
      if(enable.previewHash!==state.followups.previewHash)return {kind:"preview_changed" as const};
      const kickoff=state.followups.eligibleKickoffs.find(booking=>booking.id===enable.kickoffBookingId);
      if(!kickoff)return {kind:"blocked" as const,issues:["kickoff_delivery_unverified"]};
      if(state.followups.dates.some(date=>date.startsAt<=kickoff.endsAt))return {kind:"blocked" as const,issues:["followups_before_kickoff"]};
      const [binding]=await tx.update(s.onboardingFollowups).set({enabledAt:new Date(),approvedRevision:row.revision,kickoffBookingId:enable.kickoffBookingId})
        .where(eq(s.onboardingFollowups.onboardingId,row.id)).returning();
      await tx.update(s.eventTypes).set({playbookStatus:"ready"}).where(eq(s.eventTypes.id,binding!.eventTypeId));
    }else {
      const [binding]=await tx.update(s.onboardingKickoffs).set({publishedAt:new Date()}).where(eq(s.onboardingKickoffs.onboardingId,row.id)).returning();
      await tx.update(s.eventTypes).set({playbookStatus:"ready"}).where(eq(s.eventTypes.id,binding!.eventTypeId));
    }
    await tx.update(s.engagements).set({status:"active",updatedAt:new Date()}).where(eq(s.engagements.id,engagementId));
    await tx.insert(s.onboardingSchedulingActions).values({workspaceId,onboardingId:row.id,actorUserId:actor.userId,requestId:input.requestId,action,revision:row.revision,inputHash});
    return {kind:"applied" as const,state:await onboardingSchedulingState(row,tx,runtime)};
  });
}
export async function publishOnboardingKickoff(workspaceId:string,actor:EngagementActor,engagementId:string,input:PublishInput,db:Db=getDb(),runtime:SchedulingRuntime=schedulingRuntime()) {
  if(!["admin","owner"].includes(actor.workspaceRole))return {kind:"forbidden" as const};
  const parsed=publishOnboardingInput.safeParse(input);if(!parsed.success)return {kind:"invalid_input" as const};
  return change(workspaceId,actor,engagementId,"publish_kickoff",parsed.data,db,runtime);
}
export async function enableOnboardingFollowups(workspaceId:string,actor:EngagementActor,engagementId:string,input:EnableInput,db:Db=getDb(),runtime:SchedulingRuntime=schedulingRuntime()) {
  const parsed=enableFollowupsInput.safeParse(input);if(!parsed.success)return {kind:"invalid_input" as const};
  return change(workspaceId,actor,engagementId,"enable_followups",parsed.data,db,runtime);
}

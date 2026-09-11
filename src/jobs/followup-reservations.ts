import { listDueFollowupExtensions, recordFollowupExtensionResult } from "../db/followup-extension-state";
import { getFollowupSchedule, previewFollowupSchedule, applyFollowupSchedule } from "../db/followup-schedule-repo";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../db/client";
import { FOLLOWUP_SCHEDULER_NAME,listDueFollowupReservations,recordFollowupSchedulerIssue } from "../db/followup-automation-state";
import { reserveOnboardingFollowup } from "../db/followup-reservation-repo";
import * as s from "../db/schema";
export async function runFollowupReservationBatch(db:NodePgDatabase<typeof s>=getDb(),now=new Date()) {
  for(const row of await listDueFollowupExtensions(db,now)) {
    const [identity]=await db.select({role:s.workspaceMembers.role,status:s.users.status}).from(s.workspaceMembers)
      .innerJoin(s.users,eq(s.users.id,s.workspaceMembers.userId)).where(and(eq(s.workspaceMembers.workspaceId,row.workspaceId),eq(s.workspaceMembers.userId,row.actorUserId)));
    if(!identity||identity.status!=="active"||!["admin","owner"].includes(identity.role)) {
      await recordFollowupExtensionResult(row,row.revision,"followup_automation_identity_unavailable",db);continue;
    }
    const actor={userId:row.actorUserId,workspaceRole:identity.role};
    const state=await getFollowupSchedule(row.workspaceId,actor,row.engagementId,db);
    if(state.kind!=="found") {await recordFollowupExtensionResult(row,row.revision,"followup_extension_context_unavailable",db);continue;}
    const input={revision:state.revision,command:{action:"extend" as const}};
    const preview=await previewFollowupSchedule(row.workspaceId,actor,row.engagementId,input,db,now);
    if(preview.kind!=="previewed")continue; // A competing schedule change is rediscovered on the next sweep.
    if(!preview.preview.canApply) {await recordFollowupExtensionResult(row,state.revision,"followup_extension_schedule_invalid",db);continue;}
    if(!preview.preview.changes.length) {await recordFollowupExtensionResult(row,state.revision,null,db);continue;}
    const applied=await applyFollowupSchedule(row.workspaceId,actor,row.engagementId,{...input,requestId:crypto.randomUUID(),previewHash:preview.previewHash},db,now);
    if(applied.kind==="applied"||applied.kind==="reused")await recordFollowupExtensionResult(row,applied.appliedRevision,null,db);
    else if(!["revision_conflict","preview_changed","engagement_closed","engagement_paused"].includes(applied.kind))await recordFollowupExtensionResult(row,state.revision,"followup_extension_apply_blocked",db);
  }
  for(const row of await listDueFollowupReservations(db,now)) {
    if(row.startsAt<=now) {await recordFollowupSchedulerIssue(row,"followup_reservation_missed",db);continue;}
    const [identity]=await db.select({role:s.workspaceMembers.role,status:s.users.status}).from(s.workspaceMembers)
      .innerJoin(s.users,eq(s.users.id,s.workspaceMembers.userId))
      .where(and(eq(s.workspaceMembers.workspaceId,row.workspaceId),eq(s.workspaceMembers.userId,row.actorUserId)));
    if(!identity||identity.status!=="active"||!["admin","owner"].includes(identity.role)) {
      await recordFollowupSchedulerIssue(row,"followup_automation_identity_unavailable",db);continue;
    }
    // Source identity is the administrator that prepared the enabled binding;
    // its current workspace authority is checked on every sweep.
    const result=await reserveOnboardingFollowup(row.workspaceId,{userId:row.actorUserId,workspaceRole:identity.role},row.engagementId,row.occurrenceId,row.revision,db);
    if(!["reserved","reused","blocked"].includes(result.kind))await recordFollowupSchedulerIssue(row,`followup_${result.kind}`,db);
  }
  // Deliberately last: an exception fails pg-boss work and never reports a
  // successful sweep. Health reads detect overdue work without this worker.
  await db.insert(s.kickoffDeliveryWorker).values({name:FOLLOWUP_SCHEDULER_NAME,lastSweepAt:new Date()})
    .onConflictDoUpdate({target:s.kickoffDeliveryWorker.name,set:{lastSweepAt:new Date()}});
}

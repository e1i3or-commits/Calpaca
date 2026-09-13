import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EngagementActor } from "../core/engagement/permissions";
import { onboardingAttendance } from "../core/engagement/franchise-onboarding";
import { getDb } from "./client";
import { kickoffConfigurationIssue, loadKickoffContext } from "./kickoff-context";
import { onboardingPublicationSummary } from "./onboarding-scheduling-state";
import * as s from "./schema";

/** Create the protected three-month check-in conversation locally. Like the
 * kickoff, publication is a separate operation; this never writes calendars
 * or dispatches invites. The check-in is hosted by the follow-up roster with
 * the Franchise Success account lead as organizer. */
export async function prepareOnboardingCheckin(workspaceId: string, actor: EngagementActor, engagementId: string, db: NodePgDatabase<typeof s> = getDb()) {
  if (!["owner", "admin"].includes(actor.workspaceRole)) return {kind:"forbidden" as const};
  return db.transaction(async tx => {
    await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId)).for("update");
    const [engagement] = await tx.select().from(s.engagements).where(and(eq(s.engagements.id,engagementId),eq(s.engagements.workspaceId,workspaceId))).for("update");
    const [onboarding] = await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.engagementId,engagementId),eq(s.franchiseOnboarding.workspaceId,workspaceId)));
    if (!engagement || !onboarding) return {kind:"not_found" as const};
    if (["completed","archived","paused"].includes(engagement.status)) return {kind:"engagement_closed" as const};
    const [existing] = await tx.select().from(s.onboardingCheckins).where(eq(s.onboardingCheckins.onboardingId,onboarding.id));
    if (existing) {
      const ctx=await loadKickoffContext(existing.eventTypeId,tx);
      if (!ctx || ctx.meetingKind!=="checkin" || await kickoffConfigurationIssue(ctx,tx)) return {kind:"checkin_configuration_changed" as const};
      const summary=await onboardingPublicationSummary(onboarding,tx);
      return {kind:"reused" as const,eventTypeId:existing.eventTypeId,checkinBookingUrl:summary.checkinBookingUrl,checkinSchedulingState:summary.checkinSchedulingState};
    }
    const [conversation] = await tx.insert(s.eventTypes).values({workspaceId,engagementId,ownerUserId:onboarding.input.accountLeadUserId,
      slug:`onboarding-checkin-${crypto.randomUUID()}`,title:`${onboarding.input.locationName} three-month check-in`,
      description:"Review how the first months have gone, share what you are seeing, and plan the next steps together.",
      durationMinutes:onboarding.input.followupDurationMinutes,mode:"group",capacity:1,playbookStatus:"draft",
      publicSelectableHostIds:[],purpose:"Check in three months after onboarding and agree on continued support.",
      participantRoles:[{role:"Franchise Success",required:true},{role:"Leadership",required:false},{role:"Franchisee",required:true}],
      outcomeDefinition:"Agree on what is working, what needs help, and the next follow-up.",
    }).returning();
    if(!conversation)throw new Error("checkin_not_created");
    await tx.insert(s.eventTypeHosts).values(onboardingAttendance(onboarding.input).followup.map(host=>({eventTypeId:conversation.id,userId:host.userId,role:host.role})));
    await tx.insert(s.onboardingCheckins).values({onboardingId:onboarding.id,eventTypeId:conversation.id,createdByUserId:actor.userId});
    return {kind:"created" as const,eventTypeId:conversation.id,checkinBookingUrl:null,checkinSchedulingState:"not_published" as const};
  });
}

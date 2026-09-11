import { onboardingPublicationSummary } from "./onboarding-scheduling-state";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EngagementActor } from "../core/engagement/permissions";
import { onboardingAttendance } from "../core/engagement/franchise-onboarding";
import { getDb } from "./client";
import { kickoffConfigurationIssue, loadKickoffContext } from "./kickoff-context";
import * as s from "./schema";

/** Create the protected conversation locally. Publication is intentionally a
 * separate operation; this API never writes calendars or dispatches invites. */
export async function prepareOnboardingKickoff(workspaceId: string, actor: EngagementActor, engagementId: string, db: NodePgDatabase<typeof s> = getDb()) {
  if (!["owner", "admin"].includes(actor.workspaceRole)) return {kind:"forbidden" as const};
  return db.transaction(async tx => {
    await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,workspaceId)).for("update");
    const [engagement] = await tx.select().from(s.engagements).where(and(eq(s.engagements.id,engagementId),eq(s.engagements.workspaceId,workspaceId))).for("update");
    const [onboarding] = await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.engagementId,engagementId),eq(s.franchiseOnboarding.workspaceId,workspaceId)));
    if (!engagement || !onboarding) return {kind:"not_found" as const};
    if (["completed","archived","paused"].includes(engagement.status)) return {kind:"engagement_closed" as const};
    const [existing] = await tx.select().from(s.onboardingKickoffs).where(eq(s.onboardingKickoffs.onboardingId,onboarding.id));
    if (existing) {
      const ctx=await loadKickoffContext(existing.eventTypeId,tx);
      if (!ctx || await kickoffConfigurationIssue(ctx,tx)) return {kind:"kickoff_configuration_changed" as const};
      const summary=await onboardingPublicationSummary(onboarding,tx);
      return {kind:"reused" as const,eventTypeId:existing.eventTypeId,kickoffBookingUrl:summary.kickoffBookingUrl,schedulingState:summary.schedulingState};
    }
    const [conversation] = await tx.insert(s.eventTypes).values({workspaceId,engagementId,ownerUserId:onboarding.input.organizerUserId,
      slug:`onboarding-kickoff-${crypto.randomUUID()}`,title:`${onboarding.input.locationName} kickoff`,
      description:"Meet your launch team, review your launch plans, and agree on next steps.",
      durationMinutes:onboarding.input.kickoffDurationMinutes,mode:"group",capacity:1,playbookStatus:"draft",
      publicSelectableHostIds:[],purpose:"Welcome the franchisee and establish the onboarding plan.",
      participantRoles:[{role:"Franchise Success",required:true},{role:"Leadership",required:true},{role:"Franchisee",required:true}],
      outcomeDefinition:"Agree on launch priorities, owners and the next onboarding meeting.",
    }).returning();
    if(!conversation)throw new Error("kickoff_not_created");
    await tx.insert(s.eventTypeHosts).values(onboardingAttendance(onboarding.input).kickoff.map(host=>({eventTypeId:conversation.id,userId:host.userId,role:"required" as const})));
    await tx.insert(s.onboardingKickoffs).values({onboardingId:onboarding.id,eventTypeId:conversation.id,createdByUserId:actor.userId});
    return {kind:"created" as const,eventTypeId:conversation.id,kickoffBookingUrl:null,schedulingState:"not_published" as const};
  });
}

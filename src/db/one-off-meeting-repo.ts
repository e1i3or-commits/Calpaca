import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EngagementActor } from "../core/engagement/permissions";
import { oneOffMeetingInput, type OneOffMeetingInput } from "../core/engagement/one-off-meeting";
import { getDb } from "./client";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;
async function access(workspaceId:string,actor:EngagementActor,engagementId:string,db:Db) {
  const [row]=await db.select({engagement:s.engagements,onboarding:s.franchiseOnboarding}).from(s.engagements)
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.engagementId,s.engagements.id))
    .where(and(eq(s.engagements.id,engagementId),eq(s.engagements.workspaceId,workspaceId),eq(s.franchiseOnboarding.workspaceId,workspaceId)));
  if(!row)return null;
  const allowed=["admin","owner"].includes(actor.workspaceRole)||row.engagement.accountLeadUserId===actor.userId||row.onboarding.input.franchiseSuccessUserIds.includes(actor.userId);
  return allowed?row:null;
}
export async function listOneOffMeetings(workspaceId:string,actor:EngagementActor,engagementId:string,db:Db=getDb()) {
  const row=await access(workspaceId,actor,engagementId,db);if(!row)return {kind:"not_found" as const};
  const meetings=await db.select({eventTypeId:s.eventTypes.id,title:s.onboardingOneOffs.title,durationMinutes:s.onboardingOneOffs.durationMinutes,slug:s.eventTypes.slug,bookingId:s.bookings.id,startsAt:s.bookings.startsAt,status:s.bookings.status,inviteStatus:s.bookings.inviteStatus})
    .from(s.onboardingOneOffs).innerJoin(s.eventTypes,eq(s.eventTypes.id,s.onboardingOneOffs.eventTypeId))
    .leftJoin(s.bookings,and(eq(s.bookings.eventTypeId,s.eventTypes.id),eq(s.bookings.status,"confirmed")))
    .where(eq(s.onboardingOneOffs.onboardingId,row.onboarding.id)).orderBy(desc(s.onboardingOneOffs.createdAt));
  return {kind:"found" as const,meetings};
}
/** Immutable per-meeting roster. The normal protected booking flow checks
 * availability and queues tracked invitations when a time is confirmed. */
export async function createOneOffMeeting(workspaceId:string,actor:EngagementActor,engagementId:string,input:OneOffMeetingInput,db:Db=getDb()) {
  const parsed=oneOffMeetingInput.safeParse(input);if(!parsed.success)return {kind:"invalid_input" as const};
  return db.transaction(async tx=>{
    await tx.select({id:s.engagements.id}).from(s.engagements).where(and(eq(s.engagements.id,engagementId),eq(s.engagements.workspaceId,workspaceId))).for("update");
    const row=await access(workspaceId,actor,engagementId,tx);if(!row)return {kind:"not_found" as const};
    if(row.engagement.status!=="active")return {kind:"engagement_closed" as const};
    const value=parsed.data, organizerUserId=row.engagement.accountLeadUserId;
    if(!value.attendees.some(person=>person.userId===organizerUserId&&person.role==="required"))return {kind:"organizer_required" as const};
    const active=await tx.select({id:s.users.id}).from(s.users).innerJoin(s.workspaceMembers,eq(s.workspaceMembers.userId,s.users.id))
      .where(and(eq(s.workspaceMembers.workspaceId,workspaceId),eq(s.workspaceMembers.status,"active"),eq(s.users.status,"active"),inArray(s.users.id,value.attendees.map(person=>person.userId))));
    if(active.length!==value.attendees.length)return {kind:"attendee_unavailable" as const};
    const [existing]=await tx.select({binding:s.onboardingOneOffs,event:s.eventTypes}).from(s.onboardingOneOffs).innerJoin(s.eventTypes,eq(s.eventTypes.id,s.onboardingOneOffs.eventTypeId))
      .where(and(eq(s.onboardingOneOffs.onboardingId,row.onboarding.id),eq(s.onboardingOneOffs.requestId,value.requestId)));
    if(existing) {
      if(existing.binding.title!==value.title||existing.binding.durationMinutes!==value.durationMinutes||existing.binding.attendees.length!==value.attendees.length||existing.binding.attendees.some(person=>!value.attendees.some(other=>person.userId===other.userId&&person.role===other.role)))return {kind:"request_conflict" as const};
      return {kind:"reused" as const,eventTypeId:existing.event.id,bookingPath:`/book/${existing.event.slug}`};
    }
    const [event]=await tx.insert(s.eventTypes).values({workspaceId,engagementId,ownerUserId:organizerUserId,slug:`onboarding-one-off-${crypto.randomUUID()}`,title:value.title,
      description:"Additional meeting for this franchise onboarding.",durationMinutes:value.durationMinutes,mode:"group",capacity:1,playbookStatus:"ready",
      publicSelectableHostIds:[],purpose:"Discuss this engagement and agree on next steps.",outcomeDefinition:"Record decisions and follow-up actions."}).returning();
    if(!event)throw new Error("meeting_not_created");
    await tx.insert(s.eventTypeHosts).values(value.attendees.map(person=>({eventTypeId:event.id,...person})));
    await tx.insert(s.onboardingOneOffs).values({eventTypeId:event.id,onboardingId:row.onboarding.id,requestId:value.requestId,title:value.title,durationMinutes:value.durationMinutes,attendees:value.attendees,organizerUserId,createdByUserId:actor.userId});
    return {kind:"created" as const,eventTypeId:event.id,bookingPath:`/book/${event.slug}`};
  });
}

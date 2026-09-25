/** One-time, Kai-authorized departure repair. Default is a full transaction
 * rehearsal that rolls back, including queued deliveries. --apply commits.
 * This deliberately does not expose a generic way around protected bookings.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import { writeFileSync } from "node:fs";
import { getDb } from "../src/db/client";
import * as s from "../src/db/schema";
import { franchiseOnboardingInput, onboardingAttendance } from "../src/core/engagement/franchise-onboarding";
import { rebuildProjection } from "../src/db/booking-repo";
import { guardKickoffBooking } from "../src/db/kickoff-booking-guard";
import { queueKickoffDelivery } from "../src/db/kickoff-delivery-repo";

const onboardingId="bead3111-0a5a-4f37-b6cc-f358df6a0058";
const departed="7373511c-caa0-45f6-bbc9-2c0f98890ac2";
const replacement="e647be75-0e39-45a8-9c00-b01ea3d6593c";
const actor="0bc2de4d-c197-4758-a0ec-b28159cc444b";
const workspaceId="62ef688e-c8ab-478c-b76f-5af4755a2bd5";
const apply=process.argv.includes("--apply");
const rehearsal=new Error("rehearsal_rollback");
let report:unknown;
try {
 await getDb().transaction(async tx=>{
  await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
  const [initial]=await tx.select().from(s.franchiseOnboarding).where(eq(s.franchiseOnboarding.id,onboardingId));
  if(!initial || initial.workspaceId!==workspaceId)throw new Error("identity_mismatch");
  for(const userId of [...initial.attendance.kickoff.map(h=>h.userId)].sort())
   await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId},0))`);
  const [engagement]=await tx.select().from(s.engagements).where(eq(s.engagements.id,initial.engagementId)).for("update");
  const [row]=await tx.select().from(s.franchiseOnboarding).where(eq(s.franchiseOnboarding.id,onboardingId)).for("update");
  if(!row || row.revision!==2 || engagement?.status!=="active" || row.input.accountLeadUserId!==replacement || row.input.organizerUserId!==replacement)
   throw new Error("reviewed_roster_changed");
  const members=await tx.select({id:s.users.id,status:s.users.status}).from(s.users).where(inArray(s.users.id,[departed,replacement,actor]));
  const memberships=await tx.select().from(s.workspaceMembers).where(and(eq(s.workspaceMembers.workspaceId,workspaceId),inArray(s.workspaceMembers.userId,[departed,replacement])));
  if(memberships.find(m=>m.userId===departed)?.status!=="inactive" || memberships.find(m=>m.userId===replacement)?.status!=="active" || members.find(m=>m.id===replacement)?.status!=="active")throw new Error("member_status_changed");
  const [actorMembership]=await tx.select().from(s.workspaceMembers).where(and(eq(s.workspaceMembers.workspaceId,workspaceId),eq(s.workspaceMembers.userId,actor)));
  if(!actorMembership || actorMembership.status!=="active" || !["owner","admin"].includes(actorMembership.role))throw new Error("actor_not_admin");
  const input=franchiseOnboardingInput.parse({...row.input,franchiseSuccessUserIds:row.input.franchiseSuccessUserIds.filter(id=>id!==departed)});
  if(input.franchiseSuccessUserIds.length!==3 || !input.franchiseSuccessUserIds.includes(replacement))throw new Error("replacement_not_in_team");
  const attendance=onboardingAttendance(input);
  const [followup]=await tx.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,onboardingId));
  const [kickoff]=await tx.select().from(s.onboardingKickoffs).where(eq(s.onboardingKickoffs.onboardingId,onboardingId));
  const [checkin]=await tx.select().from(s.onboardingCheckins).where(eq(s.onboardingCheckins.onboardingId,onboardingId));
  if(!followup?.enabledAt || followup.approvedRevision!==2 || !kickoff?.publishedAt)throw new Error("publication_changed");
  const eventIds=[kickoff.eventTypeId,followup.eventTypeId,...(checkin?[checkin.eventTypeId]:[])];
  const future=await tx.select().from(s.bookings).where(and(inArray(s.bookings.eventTypeId,eventIds),eq(s.bookings.status,"confirmed"),gt(s.bookings.startsAt,new Date()))).for("update");
  if(future.length!==4 || future.some(b=>b.eventTypeId!==followup.eventTypeId || b.inviteStatus!=="delivered" || !b.googleEventId || !b.hostUserIds.includes(departed) || !b.hostUserIds.includes(replacement)))throw new Error("reviewed_bookings_changed");
  const pending=await tx.select({id:s.kickoffDeliveries.id}).from(s.kickoffDeliveries).where(and(inArray(s.kickoffDeliveries.bookingId,future.map(b=>b.id)),inArray(s.kickoffDeliveries.status,["queued","processing","awaiting_delivery","needs_attention"])));
  if(pending.length)throw new Error("delivery_in_progress_or_unresolved");
  const dates=await tx.select().from(s.onboardingFollowupOccurrences).where(eq(s.onboardingFollowupOccurrences.onboardingId,onboardingId));
  if(dates.length!==8)throw new Error("reviewed_dates_changed");
  const before={onboarding:row,dates,bookings:future.map(b=>({id:b.id,startsAt:b.startsAt,endsAt:b.endsAt,hosts:b.hostUserIds,eventId:b.googleEventId}))};
  writeFileSync(`/tmp/jacksonville-roster-${apply?"apply":"rehearsal"}-before.json`,JSON.stringify(before,null,2),{mode:0o600,flag:"wx"});
  await tx.update(s.franchiseOnboarding).set({input,attendance,revision:3,updatedAt:new Date()}).where(eq(s.franchiseOnboarding.id,onboardingId));
  // The user approved retaining the same cadence and all eight dates.
  await tx.update(s.onboardingFollowups).set({approvedRevision:3}).where(eq(s.onboardingFollowups.onboardingId,onboardingId));
  for(const eventId of eventIds)await tx.delete(s.eventTypeHosts).where(and(eq(s.eventTypeHosts.eventTypeId,eventId),eq(s.eventTypeHosts.userId,departed)));
  await tx.delete(s.engagementPeople).where(and(eq(s.engagementPeople.engagementId,row.engagementId),eq(s.engagementPeople.userId,departed)));
  await tx.insert(s.franchiseOnboardingChanges).values({workspaceId,onboardingId,actorUserId:actor,revision:3,kind:"roster_departure_handoff_20260923",cadence:row.cadence});
  for(const booking of future) {
   const hostUserIds=booking.hostUserIds.filter(id=>id!==departed);
   const slot={start:Temporal.Instant.from(booking.startsAt.toISOString()),end:Temporal.Instant.from(booking.endsAt.toISOString())};
   const guarded=await guardKickoffBooking(booking.eventTypeId,hostUserIds,slot,tx,booking.id);
   if(guarded.kind!=="allowed")throw new Error(`booking_preflight:${booking.id}:${guarded.kind==="blocked"?guarded.error:guarded.kind}`);
   // Preserve event sourcing. The second event resets delivery state and
   // records the same times; the durable update uses the existing Google ID.
   const stamp=Date.now();
   await tx.insert(s.bookingEvents).values({bookingId:booking.id,kind:"reassigned",payload:{hostUserIds:guarded.hostUserIds,evidenceReference:"infra/onboarding-recovery-20260923",authorizedBy:actor,removedUserId:departed},createdAt:new Date(stamp)});
   const [source]=await tx.insert(s.bookingEvents).values({bookingId:booking.id,kind:"rescheduled",payload:{startsAt:booking.startsAt.toISOString(),endsAt:booking.endsAt.toISOString(),reason:"roster_only_handoff_dates_unchanged"},createdAt:new Date(stamp+1)}).returning({id:s.bookingEvents.id});
   const rebuilt=await rebuildProjection(booking.id,tx);
   if(!rebuilt.ok || rebuilt.value.startsAt.toString()!==slot.start.toString() || rebuilt.value.endsAt.toString()!==slot.end.toString() || rebuilt.value.hostUserIds.includes(departed))throw new Error("event_projection_failed");
   await queueKickoffDelivery(booking.id,source!.id,"rescheduled",tx);
  }
  report={mode:apply?"applied":"rehearsal",onboardingId,revision:3,bookingIds:future.map(b=>b.id),datesPreserved:dates.length};
  if(!apply)throw rehearsal;
 });
 console.log(JSON.stringify(report));process.exit(0);
} catch(error) {
 if(error===rehearsal){console.log(JSON.stringify(report));process.exit(0);}
 console.error(error instanceof Error?error.message:"repair_failed");process.exit(1);
}

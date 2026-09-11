import { runFollowupReservationBatch } from "../../src/jobs/followup-reservations";
import { FOLLOWUP_SCHEDULER_NAME } from "../../src/db/followup-automation-state";
import { claimKickoffDelivery, recordKickoffReceipt, kickoffDeliveryReport } from "../../src/db/kickoff-delivery-repo";
import {describe,expect,test} from "bun:test";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {eq,sql} from "drizzle-orm";
import {Temporal} from "@js-temporal/polyfill";
import * as s from "../../src/db/schema";
import {franchiseOnboardingInput} from "../../src/core/engagement/franchise-onboarding";
import {provisionFranchiseOnboarding} from "../../src/db/franchise-onboarding-repo";
import {prepareOnboardingKickoff} from "../../src/db/prepare-kickoff-repo";
import {applyFollowupSchedule,getFollowupSchedule,previewFollowupSchedule} from "../../src/db/followup-schedule-repo";
import {getFollowupReservations,prepareOnboardingFollowups,reserveOnboardingFollowup} from "../../src/db/followup-reservation-repo";
import {appendEvent,getInviteContext} from "../../src/db/booking-repo";
import {updateEngagementStatus} from "../../src/db/engagement-repo";
import {kickoffPubliclyAvailable} from "../../src/db/kickoff-context";
import {createHold} from "../../src/db/holds-repo";
import {runKickoffDeliveryBatch,type KickoffDeliveryDeps} from "../../src/jobs/kickoff-delivery";
import {buildMail} from "../../src/jobs/invite-email";
async function fixture() {
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),db=drizzle(pool,{schema:s});
 await migrate(db,{migrationsFolder:"drizzle"});await db.execute(sql`truncate table ${s.users}, ${s.workspaces} restart identity cascade`);await db.delete(s.kickoffDeliveryWorker);
 const people=await db.insert(s.users).values(Array.from({length:6},(_,i)=>({name:`Person ${i}`,email:`followup-reserve-${i}@example.invalid`}))).returning();
 const [workspace]=await db.insert(s.workspaces).values({name:"Follow-up reservations",slug:"followup-reservation-test"}).returning();
 const ws=workspace!.id,ids=people.map(p=>p.id),actor={userId:ids[0]!,workspaceRole:"admin" as const};
 await db.insert(s.workspaceMembers).values(ids.map(userId=>({userId,workspaceId:ws,role:"member" as const})));
 const provision=await provisionFranchiseOnboarding(ws,actor,franchiseOnboardingInput.parse({sourceWorkspaceId:crypto.randomUUID(),sourceProjectKey:"reserve",locationKey:crypto.randomUUID(),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Reservation Client",locationName:"Sample City",franchiseSuccessUserIds:ids.slice(2),kaiUserId:ids[0],andrewUserId:ids[1],accountLeadUserId:ids[2],organizerUserId:ids[0]}),db);
 if(provision.kind!=="created")throw new Error("fixture provision");const id=provision.onboarding.engagementId;
 const day=Temporal.Now.plainDateISO("UTC").add({days:2}).toString();
 const input={revision:1,command:{action:"configure" as const,rule:{cadence:"biweekly" as const,anchorDate:day,localTime:"10:00",timezone:"UTC",monthlyMode:"day_of_month" as const,count:3}}};
 const preview=await previewFollowupSchedule(ws,actor,id,input,db);if(preview.kind!=="previewed")throw new Error("fixture preview");
 const applied=await applyFollowupSchedule(ws,actor,id,{...input,previewHash:preview.previewHash,requestId:crypto.randomUUID()},db);if(applied.kind!=="applied"||!applied.schedule)throw new Error("fixture schedule");
 const occurrence=applied.schedule.occurrences[0]!;
 const kickoff=await prepareOnboardingKickoff(ws,actor,id,db);if(kickoff.kind!=="created")throw new Error("fixture kickoff");
 const prepared=await prepareOnboardingFollowups(ws,actor,id,db);if(prepared.kind!=="created")throw new Error("fixture followup");
 // Synthetic source receipt and private activation fixture only. No provider
 // calls, real invitations, or production publication occur in this test.
 const [source]=await db.insert(s.bookings).values({workspaceId:ws,eventTypeId:kickoff.eventTypeId,startsAt:new Date(Date.now()-3600000),endsAt:new Date(Date.now()-900000),hostUserIds:ids,inviteeName:"Franchisee",inviteeEmail:"owner@example.invalid",inviteeTimezone:"UTC",status:"confirmed",inviteStatus:"delivered",cancelToken:crypto.randomUUID(),rescheduleToken:crypto.randomUUID()}).returning();
 await db.update(s.onboardingFollowups).set({enabledAt:new Date(),approvedRevision:2,kickoffBookingId:source!.id});
 await db.update(s.eventTypes).set({playbookStatus:"ready",minimumNoticeMin:0});await db.update(s.engagements).set({status:"active"});
 // Optional leadership has no scheduling setup. Only FS supplies availability.
 await db.insert(s.schedules).values(ids.slice(2).map(userId=>({userId,timezone:"UTC",rules:Array.from({length:7},(_,i)=>({dow:i+1,start:"08:00",end:"18:00"}))})));
 const calendars=await db.insert(s.calendarConnections).values(ids.slice(2).map(userId=>({userId,externalCalendarId:`test-${userId}`,isWriteDestination:userId===ids[2],lastSyncedAt:new Date(),fullSyncedAt:new Date()}))).returning();
 const reserve=()=>reserveOnboardingFollowup(ws,actor,id,occurrence.id,2,db);
 return {pool,db,ws,id,ids,actor,occurrence,eventTypeId:prepared.eventTypeId,source:source!,calendars,reserve};
}
async function reviewed(f:Awaited<ReturnType<typeof fixture>>,command:import("../../src/core/engagement/followup-schedule").FollowupPreviewInput["command"]) {
 const state=await getFollowupSchedule(f.ws,f.actor,f.id,f.db);if(state.kind!=="found")throw new Error("missing schedule");
 const input={revision:state.revision,command},preview=await previewFollowupSchedule(f.ws,f.actor,f.id,input,f.db);
 if(preview.kind!=="previewed")throw new Error(JSON.stringify(preview));
 return {...input,previewHash:preview.previewHash,requestId:crypto.randomUUID()};
}
async function deliverAll(f:Awaited<ReturnType<typeof fixture>>) {
 await runKickoffDeliveryBatch(dependencies(),f.db);
 for(const row of await f.db.select().from(s.kickoffDeliveries))if(row.status==="awaiting_delivery") {
  for(const person of row.recipients)await recordKickoffReceipt({deliveryId:row.id,messageId:row.messageId,providerEventId:crypto.randomUUID(),recipient:person.email,status:"delivered"},f.db);
 }
}
const dependencies=(mail:()=>void=()=>{}):KickoffDeliveryDeps=>({configurationIssue:()=>null,credentials:async()=>({calendarId:"primary",accessToken:"synthetic"}),calendar:async()=>{},mail:async message=>{mail();return {accepted:[message.to,...message.cc??[]],rejected:[]};}});
describe.skipIf(!process.env.TEST_DATABASE_URL)("follow-up reservations",()=>{
 test("concurrent replay creates one booking with four reserved hosts and six invitation roles",async()=>{
  const f=await fixture();try {
   const results=await Promise.all([f.reserve(),f.reserve()]);expect(results.map(row=>row.kind).sort()).toEqual(["reserved","reused"]);
   const row=results.find(row=>row.kind==="reserved");if(row?.kind!=="reserved")throw new Error(JSON.stringify(results));
   expect((await f.db.select().from(s.bookings))).toHaveLength(2);
   const [booking]=await f.db.select().from(s.bookings).where(eq(s.bookings.id,row.bookingId));expect(booking?.hostUserIds[0]).toBe(f.ids[2]);expect(booking?.hostUserIds.slice().sort()).toEqual(f.ids.slice(2).sort());
   const context=await getInviteContext(row.bookingId,f.db);if(!context)throw new Error("context missing");
   expect(context.hosts).toHaveLength(6);expect(context.hosts[0]?.id).toBe(f.ids[2]);expect(context.hosts.filter(host=>host.role==="optional").map(host=>host.id).sort()).toEqual(f.ids.slice(0,2).sort());
   expect(context.managementLinksEnabled).toBe(false);
   const mail=buildMail(context,"created",Temporal.Now.instant());expect(mail.html).not.toContain("/reschedule?");expect(mail.html).not.toContain("/cancel?");
   const [intent]=await f.db.select().from(s.kickoffDeliveries);expect(intent?.recipients).toHaveLength(7);expect(intent?.ownerUserId).toBe(f.ids[2]);expect(intent?.snapshot.meetingKind).toBe("followup");
   let sends=0;await runKickoffDeliveryBatch(dependencies(()=>{sends++;}),f.db);expect(sends).toBe(1);
   expect((await f.db.select().from(s.kickoffDeliveries))[0]?.status).toBe("awaiting_delivery");
   expect((await getFollowupSchedule(f.ws,f.actor,f.id,f.db))).toMatchObject({deliveryState:"reservations_present",schedule:{occurrences:[{bookingId:row.bookingId,inviteStatus:"sent"},{},{}]}});
   expect((await prepareOnboardingFollowups(f.ws,f.actor,f.id,f.db)).kind).toBe("reused");
  }finally{await f.pool.end();}
 });
 test("required calendar conflicts and live holds create assigned issues; resolution permits one retry",async()=>{
  const f=await fixture();try {
   const [busy]=await f.db.insert(s.calendarBusyCache).values({connectionId:f.calendars[0]!.id,startsAt:new Date(f.occurrence.startsAt),endsAt:new Date(f.occurrence.endsAt)}).returning();
   expect(await f.reserve()).toMatchObject({kind:"blocked",issueCode:"kickoff_slot_unavailable",ownerUserId:f.ids[2]});
   expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(0);expect(await f.db.select().from(s.bookings)).toHaveLength(1);
   await f.db.delete(s.calendarBusyCache).where(eq(s.calendarBusyCache.id,busy!.id));
   const [hold]=await f.db.insert(s.holds).values({eventTypeId:f.source.eventTypeId,hostUserId:f.ids[3]!,slotStart:new Date(f.occurrence.startsAt),slotEnd:new Date(f.occurrence.endsAt),expiresAt:new Date(Date.now()+600000)}).returning();
   expect(await f.reserve()).toMatchObject({kind:"blocked",issueCode:"kickoff_slot_unavailable"});
   expect((await getFollowupReservations(f.ws,f.actor,f.id,f.db))).toMatchObject({attention:1});
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({attention:1,reservationAttention:1});
   expect(await kickoffDeliveryReport(crypto.randomUUID(),f.db)).toMatchObject({attention:0,reservationAttention:0});
   await f.db.update(s.holds).set({status:"expired"}).where(eq(s.holds.id,hold!.id));expect((await f.reserve()).kind).toBe("reserved");
   expect((await getFollowupReservations(f.ws,f.actor,f.id,f.db))).toMatchObject({attention:0});
  }finally{await f.pool.end();}
 });
 test("workspace, approval and kickoff evidence gate reservations; public and generic mutations cannot bypass them",async()=>{
  const f=await fixture();try {
   expect((await reserveOnboardingFollowup(crypto.randomUUID(),f.actor,f.id,f.occurrence.id,2,f.db)).kind).toBe("not_found");
   expect((await reserveOnboardingFollowup(f.ws,{...f.actor,workspaceRole:"member"},f.id,f.occurrence.id,2,f.db)).kind).toBe("forbidden");
   expect((await reserveOnboardingFollowup(f.ws,f.actor,f.id,crypto.randomUUID(),2,f.db)).kind).toBe("not_found");
   expect(await reserveOnboardingFollowup(f.ws,f.actor,f.id,f.occurrence.id,1,f.db)).toMatchObject({kind:"blocked",issueCode:"followup_approval_stale"});
   await f.db.update(s.bookings).set({inviteStatus:"sent"}).where(eq(s.bookings.id,f.source.id));expect(await f.reserve()).toMatchObject({kind:"blocked",issueCode:"kickoff_delivery_unverified"});
   await f.db.update(s.bookings).set({inviteStatus:"delivered"}).where(eq(s.bookings.id,f.source.id));
   expect(await kickoffPubliclyAvailable(f.eventTypeId,f.db)).toBe(false);
   expect((await createHold(f.eventTypeId,f.ids.slice(2),{start:Temporal.Instant.from(f.occurrence.startsAt),end:Temporal.Instant.from(f.occurrence.endsAt)},Temporal.Duration.from({minutes:10}),f.db)).ok).toBe(false);
   const result=await f.reserve();if(result.kind!=="reserved")throw new Error(JSON.stringify(result));
   expect(await appendEvent(result.bookingId,"cancelled",{},f.db)).toMatchObject({ok:false,error:{reason:"followup_managed_schedule"}});
   expect((await previewFollowupSchedule(f.ws,f.actor,f.id,{revision:2,command:{action:"pause"}},f.db)).kind).toBe("previewed");
   expect((await updateEngagementStatus(f.ws,f.actor,f.id,"paused",f.db)).kind).toBe("issued_schedule_requires_reconciliation");
  }finally{await f.pool.end();}
 });
 test("outbox write failure rolls back the booking and preserves a durable assigned failure",async()=>{
  const f=await fixture();try {
   await f.db.execute(sql`create function reject_followup_delivery_test() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$`);
   await f.db.execute(sql`create trigger reject_followup_delivery_test before insert on kickoff_deliveries for each row execute function reject_followup_delivery_test()`);
   expect(await f.reserve()).toMatchObject({kind:"blocked",issueCode:"followup_reservation_failed",ownerUserId:f.ids[2]});
   expect(await f.db.select().from(s.bookings)).toHaveLength(1);expect(await f.db.select().from(s.bookingEvents)).toHaveLength(0);expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(0);
   expect((await f.db.select().from(s.followupReservations))[0]?.bookingId).toBeNull();expect(await f.db.select().from(s.followupReservationEvents)).toHaveLength(1);
  }finally{await f.db.execute(sql`drop trigger if exists reject_followup_delivery_test on kickoff_deliveries`);await f.db.execute(sql`drop function if exists reject_followup_delivery_test()`);await f.pool.end();}
 });
 test("delivery rechecks approval and produces an assigned failure before any provider call",async()=>{
  const f=await fixture();try {
   expect((await f.reserve()).kind).toBe("reserved");
   await f.db.update(s.onboardingFollowups).set({approvedRevision:1});let calls=0;
   await runKickoffDeliveryBatch({...dependencies(()=>{calls++;}),credentials:async()=>{calls++;return {calendarId:"primary",accessToken:"synthetic"};}},f.db);
   expect(calls).toBe(0);expect((await f.db.select().from(s.kickoffDeliveries))[0]).toMatchObject({status:"needs_attention",issueCode:"followup_approval_stale",ownerUserId:f.ids[2]});
  }finally{await f.pool.end();}
 });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("issued follow-up reconciliation",()=>{
 test("moving an issued meeting preserves booking identity, queues one update and replays atomically",async()=>{
  const f=await fixture();try {
   const reserved=await f.reserve();if(reserved.kind!=="reserved")throw new Error("reserve failed");
   await deliverAll(f);
   const day=Temporal.Instant.from(f.occurrence.startsAt).toZonedDateTimeISO("UTC").toPlainDate().add({days:1}).toString();
   const request=await reviewed(f,{action:"move",occurrenceId:f.occurrence.id,date:day,time:"11:00"});
   const results=await Promise.all([applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db),applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db)]);
   expect(results.map(row=>row.kind).sort()).toEqual(["applied","reused"]);
   const [booking]=await f.db.select().from(s.bookings).where(eq(s.bookings.id,reserved.bookingId));
   expect(booking?.startsAt.toISOString()).toBe(`${day}T11:00:00.000Z`);expect(booking?.googleEventId).toBeTruthy();
   const deliveries=await f.db.select().from(s.kickoffDeliveries);expect(deliveries).toHaveLength(2);expect(deliveries.map(row=>row.kind).sort()).toEqual(["created","rescheduled"]);
   expect(new Set(deliveries.map(row=>row.googleEventId)).size).toBe(1);
   await deliverAll(f);expect((await f.db.select().from(s.bookings).where(eq(s.bookings.id,reserved.bookingId)))[0]?.inviteStatus).toBe("delivered");
   expect((await f.db.select().from(s.franchiseOnboarding))[0]?.revision).toBe(3);
   expect(await appendEvent(reserved.bookingId,"cancelled",{},f.db,undefined,request.requestId)).toMatchObject({ok:false,error:{reason:"followup_managed_schedule"}});
  }finally{await f.pool.end();}
 });
 test("required conflicts roll back the reviewed schedule, audit, booking and invitation changes together",async()=>{
  const f=await fixture();try {
   expect((await f.reserve()).kind).toBe("reserved");
   const day=Temporal.Instant.from(f.occurrence.startsAt).toZonedDateTimeISO("UTC").toPlainDate().add({days:1}).toString();
   await f.db.insert(s.calendarBusyCache).values({connectionId:f.calendars[1]!.id,startsAt:new Date(`${day}T11:00:00Z`),endsAt:new Date(`${day}T11:45:00Z`)});
   const request=await reviewed(f,{action:"move",occurrenceId:f.occurrence.id,date:day,time:"11:00"});
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db)).kind).toBe("calendar_reconciliation_blocked");
   const state=await getFollowupSchedule(f.ws,f.actor,f.id,f.db);expect(state).toMatchObject({revision:2,schedule:{occurrences:[{startsAt:f.occurrence.startsAt},{},{}]}});
   expect(await f.db.select().from(s.onboardingFollowupChanges)).toHaveLength(1);expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(1);
  }finally{await f.pool.end();}
 });
 test("pause cancels future calls, resume waits for cancellation delivery then creates one fresh booking with history",async()=>{
  const f=await fixture();try {
   const original=await f.reserve();if(original.kind!=="reserved")throw new Error("reserve failed");await deliverAll(f);
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,await reviewed(f,{action:"pause"}),f.db)).kind).toBe("applied");
   expect((await f.db.select().from(s.bookings).where(eq(s.bookings.id,original.bookingId)))[0]?.status).toBe("cancelled");
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,await reviewed(f,{action:"resume"}),f.db)).kind).toBe("applied");
   expect(await reserveOnboardingFollowup(f.ws,f.actor,f.id,f.occurrence.id,4,f.db)).toMatchObject({kind:"blocked",issueCode:"previous_cancellation_unverified"});
   await deliverAll(f);
   const results=await Promise.all([reserveOnboardingFollowup(f.ws,f.actor,f.id,f.occurrence.id,4,f.db),reserveOnboardingFollowup(f.ws,f.actor,f.id,f.occurrence.id,4,f.db)]);
   expect(results.map(row=>row.kind).sort()).toEqual(["reserved","reused"]);
   const fresh=results.find(row=>row.kind==="reserved");if(fresh?.kind!=="reserved")throw new Error(JSON.stringify(results));expect(fresh.bookingId).not.toBe(original.bookingId);
   expect(await f.db.select().from(s.followupBookingHistory)).toHaveLength(2);
   expect((await f.db.select().from(s.onboardingFollowupOccurrences))[0]?.id).toBe(f.occurrence.id);
   await deliverAll(f);
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,await reviewed(f,{action:"end"}),f.db)).kind).toBe("applied");
   expect((await updateEngagementStatus(f.ws,f.actor,f.id,"completed",f.db)).kind).toBe("updated");
   await deliverAll(f);expect((await f.db.select().from(s.kickoffDeliveries)).every(row=>row.status==="delivered")).toBe(true);
  }finally{await f.pool.end();}
 });
 test("an in-flight provider operation blocks changes without modifying the saved plan",async()=>{
  const f=await fixture();try {
   expect((await f.reserve()).kind).toBe("reserved");expect(await claimKickoffDelivery(f.db)).not.toBeNull();
   const request=await reviewed(f,{action:"pause"});
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db))).toMatchObject({kind:"calendar_reconciliation_blocked"});
   expect(await getFollowupSchedule(f.ws,f.actor,f.id,f.db)).toMatchObject({revision:2,schedule:{status:"planned"}});
   expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(1);
  }finally{await f.pool.end();}
 });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("follow-up batch changes",()=>{
 test("a cadence shift can reuse vacated slots, while fresh external calendar conflicts still block",async()=>{
  const f=await fixture();try {
   const state=await getFollowupSchedule(f.ws,f.actor,f.id,f.db);if(state.kind!=="found"||!state.schedule)throw new Error("missing");
   for(const occurrence of state.schedule.occurrences)expect((await reserveOnboardingFollowup(f.ws,f.actor,f.id,occurrence.id,2,f.db)).kind).toBe("reserved");
   await deliverAll(f);
   const original=await f.db.select().from(s.bookings).where(eq(s.bookings.eventTypeId,f.eventTypeId));
   await f.db.insert(s.calendarBusyCache).values(original.map(booking=>({connectionId:f.calendars[0]!.id,externalEventId:booking.googleEventId,startsAt:booking.startsAt,endsAt:booking.endsAt})));
   const shifted=Temporal.PlainDate.from(state.schedule.rule.anchorDate).add({days:14}).toString();
   const request=await reviewed(f,{action:"configure",rule:{...state.schedule.rule,anchorDate:shifted}});
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db)).kind).toBe("applied");
   expect(await f.db.select().from(s.bookings).where(eq(s.bookings.eventTypeId,f.eventTypeId))).toHaveLength(3);
   await deliverAll(f);
   expect((await f.db.select().from(s.kickoffDeliveries)).every(row=>row.status==="delivered")).toBe(true);
   // A later provider sync retaining the conflicting time is new external
   // evidence; the old mutation no longer authorizes ignoring that busy row.
   await f.db.update(s.calendarConnections).set({lastSyncedAt:new Date(Date.now()+1000)});
   const again=await reviewed(f,{action:"move",occurrenceId:f.occurrence.id,date:shifted,time:"10:00"});
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,again,f.db)).kind).toBe("calendar_reconciliation_blocked");
  }finally{await f.pool.end();}
 });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("calendar coverage",()=>{
 test("a larger event-type window cannot reserve outside the protected calendar coverage",async()=>{
  const f=await fixture();try {
   const date=Temporal.Now.plainDateISO("UTC").add({days:100}).toString();
   const request=await reviewed(f,{action:"move",occurrenceId:f.occurrence.id,date,time:"10:00"});
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db)).kind).toBe("applied");
   await f.db.update(s.eventTypes).set({rollingWindowDays:365}).where(eq(s.eventTypes.id,f.eventTypeId));
   expect(await reserveOnboardingFollowup(f.ws,f.actor,f.id,f.occurrence.id,3,f.db)).toMatchObject({kind:"blocked",issueCode:"kickoff_calendar_coverage_incomplete"});
   expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(0);
  }finally{await f.pool.end();}
 });
});


describe.skipIf(!process.env.TEST_DATABASE_URL)("automatic follow-up reservation",()=>{
 test("enabled schedules reserve automatically once across concurrent sweeps and expose worker health",async()=>{
  const f=await fixture();try {
   await f.db.update(s.workspaceMembers).set({role:"admin"}).where(eq(s.workspaceMembers.userId,f.actor.userId));
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({reservationPending:3,reservationOverdue:0,schedulerStale:true});
   await Promise.all([runFollowupReservationBatch(f.db),runFollowupReservationBatch(f.db)]);
   expect(await f.db.select().from(s.followupReservations)).toHaveLength(3);expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(3);
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({reservationPending:0,schedulerStale:false});
   await runFollowupReservationBatch(f.db);expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(3);
   await f.db.update(s.kickoffDeliveryWorker).set({lastSweepAt:new Date(0)}).where(eq(s.kickoffDeliveryWorker.name,FOLLOWUP_SCHEDULER_NAME));
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({schedulerStale:true});
  }finally{await f.pool.end();}
 });
 test("revoked automation authority is assigned, cooldown limits retries and restoration permits recovery",async()=>{
  const f=await fixture();try {
   await runFollowupReservationBatch(f.db);
   expect((await f.db.select().from(s.followupReservations)).every(row=>row.issueCode==="followup_automation_identity_unavailable"&&row.ownerUserId===f.ids[2])).toBe(true);
   expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(0);
   const auditCount=(await f.db.select().from(s.followupReservationEvents)).length;expect(auditCount).toBe(3);
   await runFollowupReservationBatch(f.db);expect(await f.db.select().from(s.followupReservationEvents)).toHaveLength(auditCount);
   await f.db.update(s.workspaceMembers).set({role:"admin"}).where(eq(s.workspaceMembers.userId,f.actor.userId));
   await f.db.update(s.followupReservations).set({updatedAt:new Date(0)});
   await runFollowupReservationBatch(f.db);expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(3);
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({reservationAttention:0,reservationPending:0});
  }finally{await f.pool.end();}
 });
 test("unactivated schedules and dates beyond coverage remain unissued; dead-worker backlog is visible without a sweep",async()=>{
  const f=await fixture();try {
   await f.db.update(s.onboardingFollowups).set({enabledAt:null});await runFollowupReservationBatch(f.db);
   expect(await f.db.select().from(s.followupReservations)).toHaveLength(0);expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({reservationPending:0,schedulerStale:false});
   await f.db.update(s.onboardingFollowups).set({enabledAt:new Date(Date.now()-3600000)});
   await f.db.update(s.onboardingFollowupOccurrences).set({updatedAt:new Date(Date.now()-3600000)});
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({reservationPending:3,reservationOverdue:3});
   const date=Temporal.Now.plainDateISO("UTC").add({days:100}).toString();
   const request=await reviewed(f,{action:"move",occurrenceId:f.occurrence.id,date,time:"10:00"});
   expect((await applyFollowupSchedule(f.ws,f.actor,f.id,request,f.db)).kind).toBe("applied");
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({reservationPending:2,reservationOverdue:2});
  }finally{await f.pool.end();}
 });
 test("a missed unreserved date is an assigned issue instead of disappearing into past history",async()=>{
  const f=await fixture();try {
   await f.db.update(s.onboardingFollowupOccurrences).set({startsAt:new Date(Date.now()-3600000),endsAt:new Date(Date.now()-900000)}).where(eq(s.onboardingFollowupOccurrences.id,f.occurrence.id));
   await runFollowupReservationBatch(f.db);
   expect((await f.db.select().from(s.followupReservations).where(eq(s.followupReservations.occurrenceId,f.occurrence.id)))[0]).toMatchObject({status:"blocked",issueCode:"followup_reservation_missed",ownerUserId:f.ids[2]});
   expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(0);
  }finally{await f.pool.end();}
 });
});

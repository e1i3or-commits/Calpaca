import {describe,expect,test} from "bun:test";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {eq,sql} from "drizzle-orm";
import {Temporal} from "@js-temporal/polyfill";
import * as s from "../../src/db/schema";
import {franchiseOnboardingInput} from "../../src/core/engagement/franchise-onboarding";
import {provisionFranchiseOnboarding,getFranchiseOnboarding} from "../../src/db/franchise-onboarding-repo";
import {prepareOnboardingKickoff} from "../../src/db/prepare-kickoff-repo";
import {prepareOnboardingFollowups} from "../../src/db/followup-reservation-repo";
import {createHold,confirmHold} from "../../src/db/holds-repo";
import {getOnboardingScheduling,publishOnboardingKickoff,enableOnboardingFollowups} from "../../src/db/onboarding-publication-repo";
import {previewFollowupSchedule,applyFollowupSchedule} from "../../src/db/followup-schedule-repo";
import {runKickoffDeliveryBatch} from "../../src/jobs/kickoff-delivery";
import {recordKickoffReceipt} from "../../src/db/kickoff-delivery-repo";
import {runFollowupReservationBatch} from "../../src/jobs/followup-reservations";
import {kickoffPubliclyAvailable} from "../../src/db/kickoff-context";
const runtime={publicOrigin:"https://calpaca.example.invalid",issues:[]};
async function fixture() {
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),db=drizzle(pool,{schema:s});
 await migrate(db,{migrationsFolder:"drizzle"});await db.execute(sql`truncate table ${s.users}, ${s.workspaces} restart identity cascade`);
 const people=await db.insert(s.users).values(Array.from({length:6},(_,i)=>({name:`Person ${i}`,email:`person-${i}@example.invalid`}))).returning();
 const [workspace]=await db.insert(s.workspaces).values({name:"Delivery test",slug:"delivery-test"}).returning();const ws=workspace!.id,actor={userId:people[0]!.id,workspaceRole:"admin" as const},ids=people.map(person=>person.id);
 await db.insert(s.workspaceMembers).values(ids.map(userId=>({userId,workspaceId:ws,role:"admin" as const})));
 const result=await provisionFranchiseOnboarding(ws,actor,franchiseOnboardingInput.parse({sourceWorkspaceId:crypto.randomUUID(),sourceProjectKey:"delivery",locationKey:crypto.randomUUID(),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Delivery Client",locationName:"Sample City",franchiseSuccessUserIds:ids.slice(2),kaiUserId:ids[0],andrewUserId:ids[1],accountLeadUserId:ids[2],organizerUserId:ids[4]}),db);
 if(result.kind!=="created")throw new Error("fixture onboarding failed");
 const prepared=await prepareOnboardingKickoff(ws,actor,result.onboarding.engagementId,db);if(prepared.kind!=="created")throw new Error("fixture kickoff failed");
 await db.update(s.eventTypes).set({minimumNoticeMin:0});
 await db.delete(s.kickoffDeliveryWorker);
 await db.insert(s.kickoffDeliveryWorker).values(["dispatcher","followup-scheduler","ses-feedback"].map(name=>({name,lastSweepAt:new Date()})));
 await db.insert(s.schedules).values(ids.map(userId=>({userId,timezone:"UTC",rules:Array.from({length:7},(_,i)=>({dow:i+1,start:"08:00",end:"18:00"}))})));
 await db.insert(s.calendarConnections).values(ids.map(userId=>({userId,externalCalendarId:`synthetic-${userId}`,isWriteDestination:true,lastSyncedAt:new Date(),fullSyncedAt:new Date()})));
 const start=Temporal.Now.zonedDateTimeISO("UTC").add({days:1}).with({hour:10,minute:0,second:0,millisecond:0,microsecond:0,nanosecond:0}).toInstant(),slot={start,end:start.add({minutes:45})};
 return {pool,db,ws,actor,ids,onboarding:result.onboarding,prepared,slot};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const request=(revision=1)=>({revision,requestId:crypto.randomUUID()});
async function deliveredKickoff(f:Fixture) {
 const published=await publishOnboardingKickoff(f.ws,f.actor,f.onboarding.engagementId,request(),f.db,runtime);if(published.kind!=="applied")throw new Error("publish failed");
 const holds=await createHold(f.prepared.eventTypeId,f.ids,f.slot,Temporal.Duration.from({minutes:10}),f.db);if(!holds.ok)throw new Error("hold failed");
 const booked=await confirmHold(holds.value.map(row=>row.id),{name:"Franchisee",email:"franchisee@example.invalid",timezone:"UTC"},f.db);if(!booked.ok)throw new Error("booking failed");
 await runKickoffDeliveryBatch({configurationIssue:()=>null,credentials:async()=>({calendarId:"synthetic",accessToken:"synthetic"}),calendar:async()=>{},mail:async mail=>({accepted:[mail.to,...(mail.cc??[])],rejected:[]})},f.db);
 const [delivery]=await f.db.select().from(s.kickoffDeliveries);
 for(const person of delivery!.recipients)await recordKickoffReceipt({deliveryId:delivery!.id,messageId:delivery!.messageId,providerEventId:crypto.randomUUID(),recipient:person.email,status:"delivered"},f.db);
 return booked.value.bookingId;
}
async function planned(f:Fixture,offset=14) {
 await prepareOnboardingFollowups(f.ws,f.actor,f.onboarding.engagementId,f.db);
 const date=f.slot.start.toZonedDateTimeISO("UTC").toPlainDate().add({days:offset}).toString();
 const input={revision:1,command:{action:"configure" as const,rule:{cadence:"biweekly" as const,anchorDate:date,localTime:"10:00",timezone:"UTC",monthlyMode:"weekday_position" as const,count:3}}};
 const preview=await previewFollowupSchedule(f.ws,f.actor,f.onboarding.engagementId,input,f.db);
 if(preview.kind!=="previewed")throw new Error("preview failed");
 const saved=await applyFollowupSchedule(f.ws,f.actor,f.onboarding.engagementId,{...input,previewHash:preview.previewHash,requestId:crypto.randomUUID()},f.db);
 if(saved.kind!=="applied")throw new Error("schedule failed");
 const state=await getOnboardingScheduling(f.ws,f.actor,f.onboarding.engagementId,f.db,runtime);if(state.kind!=="found")throw new Error("state failed");
 return state;
}
describe.skipIf(!process.env.TEST_DATABASE_URL)("onboarding publication",()=>{
 test("publication is deployment-gated, workspace scoped and revision checked",async()=>{
  const f=await fixture();try {
   const id=f.onboarding.engagementId;
   expect((await publishOnboardingKickoff(f.ws,{...f.actor,workspaceRole:"member"},id,request(),f.db,runtime)).kind).toBe("forbidden");
   expect((await publishOnboardingKickoff(crypto.randomUUID(),f.actor,id,request(),f.db,runtime)).kind).toBe("not_found");
   expect((await publishOnboardingKickoff(f.ws,f.actor,id,request(99),f.db,runtime)).kind).toBe("revision_conflict");
   expect(await publishOnboardingKickoff(f.ws,f.actor,id,request(),f.db,{...runtime,issues:["rollout_not_enabled"]})).toMatchObject({kind:"blocked",issues:["rollout_not_enabled"]});
   await f.db.delete(s.kickoffDeliveryWorker).where(eq(s.kickoffDeliveryWorker.name,"ses-feedback"));
   expect(await publishOnboardingKickoff(f.ws,f.actor,id,request(),f.db,runtime)).toMatchObject({kind:"blocked",issues:["feedback_stale"]});
   expect((await f.db.select().from(s.onboardingKickoffs))[0]?.publishedAt).toBeNull();
   expect(await f.db.select().from(s.onboardingSchedulingActions)).toHaveLength(0);
  }finally{await f.pool.end();}
 });
 test("concurrent replay publishes once and source/preparation readback reflects the real URL",async()=>{
  const f=await fixture(),old=process.env.PUBLIC_URL;process.env.PUBLIC_URL=runtime.publicOrigin;
  try {
   const id=f.onboarding.engagementId,input=request();
   const results=await Promise.all([publishOnboardingKickoff(f.ws,f.actor,id,input,f.db,runtime),publishOnboardingKickoff(f.ws,f.actor,id,input,f.db,runtime)]);
   expect(results.map(result=>result.kind).sort()).toEqual(["applied","reused"]);
   expect(await f.db.select().from(s.onboardingSchedulingActions)).toHaveLength(1);
   expect(await kickoffPubliclyAvailable(f.prepared.eventTypeId,f.db)).toBe(true);
   const recovered=await getFranchiseOnboarding(f.ws,f.actor,f.onboarding.sourceWorkspaceId,f.onboarding.sourceProjectKey,f.db);
   expect(recovered.kind).toBe("found");if(recovered.kind!=="found")throw new Error("recovery missing");
   expect(recovered.onboarding.schedulingState).toBe("published");expect(recovered.onboarding.kickoffBookingUrl).toContain("/book/onboarding-kickoff-");
   expect(await prepareOnboardingKickoff(f.ws,f.actor,id,f.db)).toMatchObject({kind:"reused",schedulingState:"published",kickoffBookingUrl:recovered.onboarding.kickoffBookingUrl});
   expect((await publishOnboardingKickoff(f.ws,f.actor,id,{...input,revision:2},f.db,runtime)).kind).toBe("request_conflict");
   await f.db.update(s.engagements).set({status:"paused"}).where(eq(s.engagements.id,id));
   const replay=await publishOnboardingKickoff(f.ws,f.actor,id,input,f.db,runtime);
   expect(replay).toMatchObject({kind:"reused",state:{kickoff:{published:true,available:false,kickoffBookingUrl:null}}});
  }finally{if(old===undefined)delete process.env.PUBLIC_URL;else process.env.PUBLIC_URL=old;await f.pool.end();}
 });
 test("audit failure rolls back publication and Engagement activation",async()=>{
  const f=await fixture();try {
   await f.db.execute(sql`create function reject_test_publication() returns trigger language plpgsql as $$ begin raise exception 'synthetic publication audit failure'; end $$`);
   await f.db.execute(sql`create trigger reject_test_publication before insert on onboarding_scheduling_actions for each row execute function reject_test_publication()`);
   try {await expect(publishOnboardingKickoff(f.ws,f.actor,f.onboarding.engagementId,request(),f.db,runtime)).rejects.toThrow();}
   finally {await f.db.execute(sql`drop trigger reject_test_publication on onboarding_scheduling_actions`);await f.db.execute(sql`drop function reject_test_publication()`);}
   expect((await f.db.select().from(s.onboardingKickoffs))[0]?.publishedAt).toBeNull();
   expect((await f.db.select().from(s.engagements))[0]?.status).toBe("draft");
   expect((await f.db.select().from(s.eventTypes))[0]?.playbookStatus).toBe("draft");
  }finally{await f.pool.end();}
 });
 test("reviewed cadence enables once from delivered kickoff and required/optional invitations stay private",async()=>{
  const f=await fixture();try {
   const bookingId=await deliveredKickoff(f),state=await planned(f),id=f.onboarding.engagementId;
   const input={...request(state.revision),previewHash:state.followups.previewHash,kickoffBookingId:bookingId};
   expect(state.followups.issues).toEqual([]);
   expect((await enableOnboardingFollowups(f.ws,f.actor,id,{...input,previewHash:"0".repeat(64)},f.db,runtime)).kind).toBe("preview_changed");
   expect(await enableOnboardingFollowups(f.ws,f.actor,id,{...input,kickoffBookingId:crypto.randomUUID()},f.db,runtime)).toMatchObject({kind:"blocked",issues:["kickoff_delivery_unverified"]});
   const lead={userId:f.ids[2]!,workspaceRole:"member" as const};
   const results=await Promise.all([enableOnboardingFollowups(f.ws,lead,id,input,f.db,runtime),enableOnboardingFollowups(f.ws,lead,id,input,f.db,runtime)]);
   expect(results.map(r=>r.kind).sort()).toEqual(["applied","reused"]);
   expect((await enableOnboardingFollowups(f.ws,lead,id,{...input,requestId:crypto.randomUUID(),kickoffBookingId:crypto.randomUUID()},f.db,runtime)).kind).toBe("request_conflict");
   expect((await enableOnboardingFollowups(f.ws,lead,id,{...input,requestId:crypto.randomUUID()},f.db,runtime)).kind).toBe("already_enabled");
   expect(await f.db.select().from(s.bookings)).toHaveLength(1);
   await runFollowupReservationBatch(f.db);
   expect(await f.db.select().from(s.bookings)).toHaveLength(4);
   const [binding]=await f.db.select().from(s.onboardingFollowups);
   expect(await kickoffPubliclyAvailable(binding!.eventTypeId,f.db)).toBe(false);
   const hosts=await f.db.select().from(s.eventTypeHosts).where(eq(s.eventTypeHosts.eventTypeId,binding!.eventTypeId));
   expect(hosts.filter(p=>p.role==="required")).toHaveLength(4);expect(hosts.filter(p=>p.role==="optional")).toHaveLength(2);
   expect((await f.db.select().from(s.onboardingSchedulingActions)).filter(a=>a.action==="enable_followups")).toHaveLength(1);
  }finally{await f.pool.end();}
 });
 test("cadence cannot start without verified kickoff or with dates before kickoff ends",async()=>{
  const f=await fixture();try {
   const state=await planned(f);
   expect(state.followups.issues).toContain("kickoff_delivery_unverified");
   expect((await enableOnboardingFollowups(f.ws,f.actor,f.onboarding.engagementId,{...request(state.revision),previewHash:state.followups.previewHash,kickoffBookingId:crypto.randomUUID()},f.db,runtime)).kind).toBe("blocked");
  }finally{await f.pool.end();}
  const f2=await fixture();try {
   const bookingId=await deliveredKickoff(f2),state=await planned(f2,0);
   expect(await enableOnboardingFollowups(f2.ws,f2.actor,f2.onboarding.engagementId,{...request(state.revision),previewHash:state.followups.previewHash,kickoffBookingId:bookingId},f2.db,runtime)).toMatchObject({kind:"blocked",issues:["followups_before_kickoff"]});
  }finally{await f2.pool.end();}
 });
});

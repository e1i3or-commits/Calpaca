import {recordSesNotification} from "../../src/db/ses-feedback-repo";
import {sesMessageKey} from "../../src/core/invite/ses-feedback";
import {describe,expect,test} from "bun:test";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {eq,inArray,sql} from "drizzle-orm";
import {Temporal} from "@js-temporal/polyfill";
import * as s from "../../src/db/schema";
import {franchiseOnboardingInput} from "../../src/core/engagement/franchise-onboarding";
import {provisionFranchiseOnboarding} from "../../src/db/franchise-onboarding-repo";
import {prepareOnboardingKickoff} from "../../src/db/prepare-kickoff-repo";
import {createHold,confirmHold} from "../../src/db/holds-repo";
import {appendEvent,getBookingById} from "../../src/db/booking-repo";
import {claimKickoffDelivery,kickoffDeliveryReport,recordKickoffReceipt,retryKickoffDelivery,startKickoffEmail,sweepKickoffDeliveries,verifyKickoffCalendar} from "../../src/db/kickoff-delivery-repo";
import {runKickoffDeliveryBatch,type KickoffDeliveryDeps} from "../../src/jobs/kickoff-delivery";

async function fixture() {
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),db=drizzle(pool,{schema:s});
 await migrate(db,{migrationsFolder:"drizzle"});await db.execute(sql`truncate table ${s.users}, ${s.workspaces} restart identity cascade`);
 const people=await db.insert(s.users).values(Array.from({length:6},(_,i)=>({name:`Person ${i}`,email:`person-${i}@example.invalid`}))).returning();
 const [workspace]=await db.insert(s.workspaces).values({name:"Delivery test",slug:"delivery-test"}).returning();const ws=workspace!.id,actor={userId:people[0]!.id,workspaceRole:"admin" as const},ids=people.map(person=>person.id);
 await db.insert(s.workspaceMembers).values(ids.map(userId=>({userId,workspaceId:ws,role:"admin" as const})));
 const result=await provisionFranchiseOnboarding(ws,actor,franchiseOnboardingInput.parse({sourceWorkspaceId:crypto.randomUUID(),sourceProjectKey:"delivery",locationKey:crypto.randomUUID(),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Delivery Client",locationName:"Sample City",franchiseSuccessUserIds:ids.slice(2),kaiUserId:ids[0],andrewUserId:ids[1],accountLeadUserId:ids[2],organizerUserId:ids[4]}),db);
 if(result.kind!=="created")throw new Error("fixture onboarding failed");
 const prepared=await prepareOnboardingKickoff(ws,actor,result.onboarding.engagementId,db);if(prepared.kind!=="created")throw new Error("fixture kickoff failed");
 // Synthetic publication only; the application still has no publication API.
 await db.update(s.onboardingKickoffs).set({publishedAt:new Date()});await db.update(s.eventTypes).set({playbookStatus:"ready",minimumNoticeMin:0});await db.update(s.engagements).set({status:"active"});
 await db.insert(s.schedules).values(ids.map(userId=>({userId,timezone:"UTC",rules:Array.from({length:7},(_,i)=>({dow:i+1,start:"08:00",end:"18:00"}))})));
 await db.insert(s.calendarConnections).values(ids.map(userId=>({userId,externalCalendarId:`synthetic-${userId}`,isWriteDestination:userId===ids[4],lastSyncedAt:new Date(),fullSyncedAt:new Date()})));
 const start=Temporal.Now.zonedDateTimeISO("UTC").add({days:1}).with({hour:10,minute:0,second:0,millisecond:0,microsecond:0,nanosecond:0}).toInstant(),slot={start,end:start.add({minutes:45})};
 const holds=await createHold(prepared.eventTypeId,ids,slot,Temporal.Duration.from({minutes:10}),db);if(!holds.ok)throw new Error("fixture hold failed");
 const booked=await confirmHold(holds.value.map(row=>row.id),{name:"Franchisee",email:"franchisee@example.invalid",timezone:"UTC"},db);if(!booked.ok)throw new Error("fixture booking failed");
 const [delivery]=await db.select().from(s.kickoffDeliveries);if(!delivery)throw new Error("durable intent missing");
 return {pool,db,ws,actor,delivery,bookingId:booked.value.bookingId,slot};
}
const deps=(onMail:()=>void=()=>{}):KickoffDeliveryDeps=>({configurationIssue:()=>null,credentials:async()=>({calendarId:"primary",accessToken:"synthetic"}),calendar:async()=>{},mail:async mail=>{onMail();return {accepted:[mail.to,...(mail.cc??[])],rejected:[]};}});
const receipt=(delivery:{id:string;messageId:string},recipient:string,id=crypto.randomUUID(),status:"delivered"|"bounced"="delivered")=>({deliveryId:delivery.id,messageId:delivery.messageId,providerEventId:id,recipient,status});

describe.skipIf(!process.env.TEST_DATABASE_URL)("durable kickoff delivery",()=>{
 test("SES feedback is atomic, replayable and bound to one provider message despite rewritten headers",async()=>{
  const f=await fixture();try {
   await runKickoffDeliveryBatch(deps(),f.db);
   const binding={topicArn:"arn:aws:sns:us-east-1:123456789012:synthetic",sendingAccountId:"123456789012",configurationSet:"synthetic"};
   const emails=f.delivery.recipients.map(p=>p.email);
   const event={eventType:"Delivery",mail:{sendingAccountId:binding.sendingAccountId,messageId:"SES-assigned-one",destination:emails,
    tags:{"ses:configuration-set":[binding.configurationSet],calpaca_delivery_id:[f.delivery.id],calpaca_message_key:[sesMessageKey(f.delivery.messageId)]}},delivery:{recipients:emails}};
   const notification={Type:"Notification" as const,TopicArn:binding.topicArn,MessageId:crypto.randomUUID(),Message:JSON.stringify(event)};
   // Fail the second recipient insert: neither the first receipt nor its projection may remain.
   await f.db.execute(sql`create function reject_test_ses_receipt() returns trigger language plpgsql as $$ begin
    if (select count(*) from kickoff_delivery_receipts)>0 then raise exception 'synthetic second receipt failure'; end if; return NEW; end $$`);
   await f.db.execute(sql`create trigger reject_test_ses_receipt before insert on kickoff_delivery_receipts for each row execute function reject_test_ses_receipt()`);
   try {await expect(recordSesNotification(notification,binding,f.db)).rejects.toThrow();}
   finally {await f.db.execute(sql`drop trigger reject_test_ses_receipt on kickoff_delivery_receipts`);await f.db.execute(sql`drop function reject_test_ses_receipt()`);}
   expect(await f.db.select().from(s.kickoffDeliveryReceipts)).toHaveLength(0);
   expect(await f.db.select().from(s.sesFeedbackNotifications)).toHaveLength(0);
   expect((await f.db.select().from(s.kickoffDeliveries))[0]).toMatchObject({status:"awaiting_delivery",providerMessageId:null});
   expect((await recordSesNotification({...notification,Message:JSON.stringify({...event,mail:{...event.mail,destination:[...emails,"stranger@example.invalid"]}})},binding,f.db)).kind).toBe("receipt_mismatch");
   const results=await Promise.all([recordSesNotification(notification,binding,f.db),recordSesNotification(notification,binding,f.db)]);
   expect(results.map(r=>r.kind).sort()).toEqual(["duplicate","recorded"]);
   expect(await f.db.select().from(s.kickoffDeliveryReceipts)).toHaveLength(emails.length);
   expect((await f.db.select().from(s.kickoffDeliveries))[0]).toMatchObject({status:"delivered",providerMessageId:"SES-assigned-one"});
   expect((await recordSesNotification({...notification,Message:JSON.stringify({...event,delivery:{recipients:[emails[0]]}})},binding,f.db)).kind).toBe("receipt_conflict");
   expect((await recordSesNotification({...notification,MessageId:crypto.randomUUID(),Message:JSON.stringify({...event,mail:{...event.mail,messageId:"different-provider-message"}})},binding,f.db)).kind).toBe("receipt_mismatch");
   const bounce={eventType:"Bounce",mail:event.mail,bounce:{bouncedRecipients:[{emailAddress:emails[0]}]}};
   expect((await recordSesNotification({...notification,MessageId:crypto.randomUUID(),Message:JSON.stringify(bounce)},binding,f.db)).kind).toBe("recorded");
   await recordSesNotification({...notification,MessageId:crypto.randomUUID()},binding,f.db);
   expect((await f.db.select().from(s.kickoffDeliveries))[0]?.status).toBe("needs_attention");
   expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("failed");
  }finally{await f.pool.end();}
 });
 test("concurrent workers send once, all seven recipients need evidence, duplicate receipts and late bounces are preserved",async()=>{
  const f=await fixture();try {
   expect(f.delivery.status).toBe("queued");expect(f.delivery.recipients).toHaveLength(7);
   let sends=0;const dependencies=deps(()=>{sends++;});
   await Promise.all([runKickoffDeliveryBatch(dependencies,f.db),runKickoffDeliveryBatch(dependencies,f.db)]);
   expect(sends).toBe(1);let [row]=await f.db.select().from(s.kickoffDeliveries);expect(row?.status).toBe("awaiting_delivery");
   expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("sent");
   expect(await appendEvent(f.bookingId,"invite_delivered",{},f.db)).toEqual({ok:false,error:{kind:"invite_delivered",reason:"kickoff_delivery_receipt_required"}});
   const first=receipt(f.delivery,f.delivery.recipients[0]!.email);
   expect((await recordKickoffReceipt(first,f.db)).kind).toBe("recorded");expect((await recordKickoffReceipt(first,f.db)).kind).toBe("duplicate");
   expect((await recordKickoffReceipt({...first,status:"bounced"},f.db)).kind).toBe("receipt_conflict");
   for(const person of f.delivery.recipients.slice(1))expect((await recordKickoffReceipt(receipt(f.delivery,person.email),f.db)).kind).toBe("recorded");
   [row]=await f.db.select().from(s.kickoffDeliveries);expect(row?.status).toBe("delivered");expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("delivered");
   expect((await recordKickoffReceipt(receipt(f.delivery,first.recipient,crypto.randomUUID(),"bounced"),f.db)).kind).toBe("recorded");
   await recordKickoffReceipt(receipt(f.delivery,first.recipient),f.db);
   [row]=await f.db.select().from(s.kickoffDeliveries);expect(row?.status).toBe("needs_attention");expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("failed");
   const report=await kickoffDeliveryReport(f.ws,f.db);expect(report.attention).toBe(1);expect(report.workerStale).toBe(false);expect(JSON.stringify(report)).not.toContain("@example.invalid");expect(JSON.stringify(report)).not.toContain("rescheduleToken");
  }finally{await f.pool.end();}
 });
 test("missing configuration is assigned, unknown email outcomes cannot resend, receipts can reconcile them",async()=>{
  const f=await fixture();try {
   let sends=0;const dependencies=deps(()=>{sends++;});
   await runKickoffDeliveryBatch({...dependencies,configurationIssue:()=>"mail_configuration_missing"},f.db);
   let [row]=await f.db.select().from(s.kickoffDeliveries);expect(row).toMatchObject({status:"needs_attention",issueCode:"mail_configuration_missing",ownerUserId:f.delivery.ownerUserId});expect(sends).toBe(0);
   expect((await retryKickoffDelivery(crypto.randomUUID(),f.delivery.id,f.actor.userId,f.db)).kind).toBe("not_found");
   expect((await retryKickoffDelivery(f.ws,f.delivery.id,f.actor.userId,f.db)).kind).toBe("queued");
   await runKickoffDeliveryBatch({...dependencies,mail:async()=>{sends++;throw new Error("synthetic timeout after acceptance");}},f.db);
   [row]=await f.db.select().from(s.kickoffDeliveries);expect(row).toMatchObject({status:"needs_attention",issueCode:"email_outcome_unknown"});
   expect((await retryKickoffDelivery(f.ws,f.delivery.id,f.actor.userId,f.db)).kind).toBe("retry_requires_reconciliation");
   await runKickoffDeliveryBatch(dependencies,f.db);expect(sends).toBe(1);
   for(const person of f.delivery.recipients)await recordKickoffReceipt(receipt(f.delivery,person.email),f.db);
   [row]=await f.db.select().from(s.kickoffDeliveries);expect(row?.status).toBe("delivered");expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("delivered");
  }finally{await f.pool.end();}
 });
 test("expired email leases become explicit incidents; calendar leases can recover",async()=>{
  const f=await fixture();try {
   const first=await claimKickoffDelivery(f.db);if(!first)throw new Error("missing claim");
   await f.db.update(s.kickoffDeliveries).set({leaseUntil:new Date(0)}).where(eq(s.kickoffDeliveries.id,first.id));
   await sweepKickoffDeliveries(f.db);expect((await f.db.select().from(s.kickoffDeliveries))[0]?.status).toBe("queued");
   const second=await claimKickoffDelivery(f.db);if(!second?.attemptId)throw new Error("missing retry claim");expect(second.attemptId).not.toBe(first.attemptId);
   await verifyKickoffCalendar(second.id,second.attemptId,f.db);await startKickoffEmail(second.id,second.attemptId,f.db);
   await f.db.update(s.kickoffDeliveries).set({leaseUntil:new Date(0)}).where(eq(s.kickoffDeliveries.id,second.id));
   await sweepKickoffDeliveries(f.db);expect((await f.db.select().from(s.kickoffDeliveries))[0]?.issueCode).toBe("email_outcome_unknown");expect(await claimKickoffDelivery(f.db)).toBeNull();
  }finally{await f.pool.end();}
 });
 test("partial SMTP rejection is assigned and never retried automatically",async()=>{
  const f=await fixture();try {
   let sends=0;
   await runKickoffDeliveryBatch({...deps(),mail:async mail=>{sends++;return {accepted:[mail.to,...(mail.cc??[]).slice(1)],rejected:[mail.cc![0]!]};}},f.db);
   const [row]=await f.db.select().from(s.kickoffDeliveries);
   expect(row).toMatchObject({status:"needs_attention",issueCode:"recipient_rejected"});
   expect(row!.recipients.filter(person=>person.status==="failed")).toHaveLength(1);
   expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("failed");
   expect((await retryKickoffDelivery(f.ws,f.delivery.id,f.actor.userId,f.db)).kind).toBe("retry_requires_reconciliation");
   await runKickoffDeliveryBatch(deps(()=>{sends++;}),f.db);expect(sends).toBe(1);
  }finally{await f.pool.end();}
 });
 test("overdue feedback is visible even without a running worker, and late receipts reconcile it",async()=>{
  const f=await fixture();try {
   await runKickoffDeliveryBatch(deps(),f.db);
   await f.db.update(s.kickoffDeliveries).set({deadlineAt:new Date(0)});
   await f.db.update(s.kickoffDeliveryWorker).set({lastSweepAt:new Date(0)});
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({overdue:1,workerStale:true});
   await sweepKickoffDeliveries(f.db);
   expect((await f.db.select().from(s.kickoffDeliveries))[0]?.issueCode).toBe("delivery_receipt_overdue");
   for(const person of f.delivery.recipients)await recordKickoffReceipt(receipt(f.delivery,person.email),f.db);
   expect(await kickoffDeliveryReport(f.ws,f.db)).toMatchObject({overdue:0,attention:0});
   expect(await kickoffDeliveryReport(crypto.randomUUID(),f.db)).toMatchObject({deliveries:[],overdue:0,attention:0});
  }finally{await f.pool.end();}
 });
 test("rescheduling before dispatch sends only the new time; old feedback cannot deliver a later version",async()=>{
  const f=await fixture();try {
   const moved={startsAt:f.slot.start.add({hours:1}),endsAt:f.slot.end.add({hours:1})};
   expect((await appendEvent(f.bookingId,"rescheduled",moved,f.db)).ok).toBe(true);
   expect((await f.db.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.id,f.delivery.id)))[0]?.status).toBe("superseded");
   let sends=0;let calendarKind="";
   await runKickoffDeliveryBatch({...deps(()=>{sends++;}),calendar:async row=>{calendarKind=row.kind;}},f.db);
   expect(sends).toBe(1);expect(calendarKind).toBe("created");
   const [sent]=await f.db.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.kind,"rescheduled"));
   expect(sent?.snapshot.booking.startsAt).toBe(moved.startsAt.toString());
   expect((await appendEvent(f.bookingId,"rescheduled",{startsAt:moved.startsAt.add({hours:1}),endsAt:moved.endsAt.add({hours:1})},f.db)).ok).toBe(true);
   for(const person of sent!.recipients)await recordKickoffReceipt(receipt(sent!,person.email),f.db);
   expect((await getBookingById(f.bookingId,f.db))?.inviteStatus).toBe("none");
   await runKickoffDeliveryBatch({...deps(()=>{sends++;}),calendar:async row=>{calendarKind=row.kind;}},f.db);
   expect(sends).toBe(2);expect(calendarKind).toBe("rescheduled");
  }finally{await f.pool.end();}
 });
 test("a delivery insert failure rolls back its booking event and time change",async()=>{
  const f=await fixture();try {
   await f.db.execute(sql`create function reject_test_delivery() returns trigger language plpgsql as $$ begin raise exception 'synthetic delivery failure'; end $$`);
   await f.db.execute(sql`create trigger reject_test_delivery before insert on kickoff_deliveries for each row execute function reject_test_delivery()`);
   const before=await f.db.select().from(s.bookingEvents);
   await expect(appendEvent(f.bookingId,"rescheduled",{startsAt:f.slot.start.add({hours:1}),endsAt:f.slot.end.add({hours:1})},f.db)).rejects.toThrow();
   expect(await f.db.select().from(s.bookingEvents)).toHaveLength(before.length);
   expect((await getBookingById(f.bookingId,f.db))?.startsAt.toString()).toBe(f.slot.start.toString());
   expect((await f.db.select().from(s.kickoffDeliveries))[0]?.status).toBe("queued");
   const holds=await createHold(f.delivery.snapshot.booking.eventTypeId,f.delivery.snapshot.hosts.map(person=>person.id),
    {start:f.slot.start.add({hours:2}),end:f.slot.end.add({hours:2})},Temporal.Duration.from({minutes:10}),f.db);
   if(!holds.ok)throw new Error("rollback fixture hold failed");
   const holdIds=holds.value.map(row=>row.id);
   await expect(confirmHold(holdIds,{name:"Another franchisee",email:"another@example.invalid",timezone:"UTC"},f.db)).rejects.toThrow();
   expect(await f.db.select().from(s.bookings)).toHaveLength(1);
   expect(await f.db.select().from(s.bookingEvents)).toHaveLength(before.length);
   expect((await f.db.select().from(s.holds).where(inArray(s.holds.id,holdIds))).every(row=>row.status==="active")).toBe(true);
  }finally{
   await f.db.execute(sql`drop trigger if exists reject_test_delivery on kickoff_deliveries`);
   await f.db.execute(sql`drop function if exists reject_test_delivery()`);
   await f.pool.end();
  }
 });
});

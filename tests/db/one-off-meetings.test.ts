import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as s from "../../src/db/schema";
import { franchiseOnboardingInput } from "../../src/core/engagement/franchise-onboarding";
import { provisionFranchiseOnboarding } from "../../src/db/franchise-onboarding-repo";
import { createOneOffMeeting, listOneOffMeetings } from "../../src/db/one-off-meeting-repo";
import { loadKickoffContext, protectedReadiness } from "../../src/db/kickoff-context";
import { createHold, confirmHold } from "../../src/db/holds-repo";
import { getInviteContext } from "../../src/db/booking-repo";
import { claimMeetingNotes, readClaimedMeeting } from "../../src/db/meeting-notes-queue";

describe.skipIf(!process.env.TEST_DATABASE_URL)("engagement one-off meetings",()=>{
 test("custom roster and duration retain protected booking, durable invitations and notes discovery",async()=>{
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),db=drizzle(pool,{schema:s});
  try {
   await migrate(db,{migrationsFolder:"drizzle"});await db.execute(sql`truncate table ${s.users},${s.workspaces} restart identity cascade`);
   const people=await db.insert(s.users).values(Array.from({length:6},(_,i)=>({name:`Person ${i}`,email:`oneoff-${i}@example.invalid`}))).returning();
   const ids=people.map(person=>person.id),[workspace]=await db.insert(s.workspaces).values({name:"One off",slug:"oneoff"}).returning(),ws=workspace!.id;
   await db.insert(s.workspaceMembers).values(ids.map(userId=>({workspaceId:ws,userId,role:"member" as const})));
   const actor={userId:ids[2]!,workspaceRole:"member" as const};
   const provision=await provisionFranchiseOnboarding(ws,{...actor,workspaceRole:"admin"},franchiseOnboardingInput.parse({sourceWorkspaceId:crypto.randomUUID(),sourceProjectKey:"oneoff-test",locationKey:crypto.randomUUID(),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Synthetic Client",locationName:"Sample City",franchiseSuccessUserIds:ids.slice(2),kaiUserId:ids[0],andrewUserId:ids[1],accountLeadUserId:ids[2],organizerUserId:ids[2]}),db);
   if(provision.kind!=="created")throw new Error("fixture");const id=provision.onboarding.engagementId;
   await db.update(s.engagements).set({status:"active"}).where(eq(s.engagements.id,id));
   const input={requestId:crypto.randomUUID(),title:"Marina planning",durationMinutes:30,attendees:[{userId:ids[2]!,role:"required" as const},{userId:ids[3]!,role:"optional" as const}]};
   expect((await createOneOffMeeting(ws,{...actor,userId:ids[0]!},id,input,db)).kind).toBe("not_found");
   expect((await createOneOffMeeting(crypto.randomUUID(),actor,id,input,db)).kind).toBe("not_found");
   expect((await createOneOffMeeting(ws,actor,id,{...input,attendees:[input.attendees[1]!] },db)).kind).toBe("organizer_required");
   const results=await Promise.all([createOneOffMeeting(ws,actor,id,input,db),createOneOffMeeting(ws,actor,id,input,db)]);
   expect(results.map(result=>result.kind).sort()).toEqual(["created","reused"]);
   expect((await createOneOffMeeting(ws,actor,id,{...input,durationMinutes:60},db)).kind).toBe("request_conflict");
   const created=results.find(result=>result.kind==="created");if(!created||created.kind!=="created")throw new Error("not created");
   const eventId=created.eventTypeId,ctx=await loadKickoffContext(eventId,db);if(!ctx)throw new Error("no context");
   expect(ctx.meetingKind).toBe("one_off");expect(ctx.eventType.durationMinutes).toBe(30);
   expect((await protectedReadiness(ctx,db)).calendarSetupReady).toBe(false);
   await db.insert(s.schedules).values({userId:ids[2]!,timezone:"UTC",rules:Array.from({length:7},(_,i)=>({dow:i+1,start:"08:00",end:"18:00"}))});
   await db.insert(s.calendarConnections).values({userId:ids[2]!,externalCalendarId:"synthetic",isWriteDestination:true,lastSyncedAt:new Date(),fullSyncedAt:new Date()});
   expect((await protectedReadiness(ctx,db)).calendarSetupReady).toBe(true);
   const start=Temporal.Now.zonedDateTimeISO("UTC").add({days:1}).with({hour:10,minute:0,second:0,millisecond:0,microsecond:0,nanosecond:0}).toInstant(),ttl=Temporal.Duration.from({minutes:10});
   expect((await createHold(eventId,[ids[2]!],{start,end:start.add({minutes:45})},ttl,db)).ok).toBe(false);
   const hold=await createHold(eventId,[ids[2]!],{start,end:start.add({minutes:30})},ttl,db);if(!hold.ok)throw new Error(JSON.stringify(hold));
   const booking=await confirmHold(hold.value.map(row=>row.id),{email:"client@example.invalid",name:"Client",timezone:"UTC"},db);if(!booking.ok)throw new Error(JSON.stringify(booking));
   expect(await db.select().from(s.kickoffDeliveries)).toHaveLength(1);
   const invite=await getInviteContext(booking.value.bookingId,db);
   expect(invite?.meetingKind).toBe("one_off");expect(invite?.hosts).toHaveLength(2);
   const listed=await listOneOffMeetings(ws,actor,id,db);expect(listed.kind).toBe("found");
   if(listed.kind==="found")expect(listed.meetings[0]?.bookingId).toBe(booking.value.bookingId);
   const after=new Date(start.add({minutes:51}).epochMilliseconds);
   const claim=await claimMeetingNotes(ws,new Date(start.subtract({hours:24}).epochMilliseconds),after,db);
   expect(claim?.bookingId).toBe(booking.value.bookingId);
   const notes=await readClaimedMeeting(ws,booking.value.bookingId,db);expect(notes?.sourceProjectKey).toBe("oneoff-test");expect(notes?.calendar).toBeNull();
   expect(await claimMeetingNotes(ws,new Date(start.subtract({hours:24}).epochMilliseconds),after,db)).toBeNull();
  } finally {await pool.end();}
 });
});

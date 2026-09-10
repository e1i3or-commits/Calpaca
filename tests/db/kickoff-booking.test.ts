import { describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import * as s from "../../src/db/schema";
import { franchiseOnboardingInput } from "../../src/core/engagement/franchise-onboarding";
import { provisionFranchiseOnboarding } from "../../src/db/franchise-onboarding-repo";
import { prepareOnboardingKickoff } from "../../src/db/prepare-kickoff-repo";
import { createHold, confirmHold, confirmReschedule } from "../../src/db/holds-repo";
import { appendEvent, getBookingById, getInviteContext, rebuildProjection } from "../../src/db/booking-repo";
import { getEventTypeBySlug, getEventTypeForBookingById, getPublicBookingPage } from "../../src/db/availability-repo";
import { buildMail } from "../../src/jobs/invite-email";

describe.skipIf(!process.env.TEST_DATABASE_URL)("protected kickoff bookings", () => {
 test("atomic preparation, unpublished isolation, complete roster, fresh confirmation and stable organizer", async () => {
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});const db=drizzle(pool,{schema:s});
  try {
   await migrate(db,{migrationsFolder:"drizzle"});
   await db.execute(sql`truncate table ${s.users}, ${s.workspaces} restart identity cascade`);
   const people=await db.insert(s.users).values(["Kai","Andrew","Jake","Andres","Santiago","Cal"].map((name,i)=>({name,email:`kickoff-${i}@example.invalid`}))).returning();
   const [ws,other]=await db.insert(s.workspaces).values([{name:"Review",slug:"kickoff-test"},{name:"Other",slug:"kickoff-other"}]).returning();
   const actor={userId:people[0]!.id,workspaceRole:"admin" as const};
   const organizer=people[4]!.id;
   const ids=people.map(person=>person.id);
   await db.insert(s.workspaceMembers).values(ids.map(userId=>({userId,workspaceId:ws!.id,role:"admin" as const})));
   const provision=await provisionFranchiseOnboarding(ws!.id,actor,franchiseOnboardingInput.parse({sourceWorkspaceId:crypto.randomUUID(),sourceProjectKey:"kickoff-test",locationKey:crypto.randomUUID(),
    franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Synthetic Entity",locationName:"Sample City",
    franchiseSuccessUserIds:ids.slice(2),kaiUserId:ids[0],andrewUserId:ids[1],accountLeadUserId:ids[2],organizerUserId:organizer}),db);
   if(provision.kind!=="created")throw new Error("provision failed");
   const engagementId=provision.onboarding.engagementId;
   expect((await prepareOnboardingKickoff(ws!.id,{...actor,workspaceRole:"member"},engagementId,db)).kind).toBe("forbidden");
   expect((await prepareOnboardingKickoff(other!.id,actor,engagementId,db)).kind).toBe("not_found");
   await db.execute(sql`create function reject_kickoff_binding() returns trigger language plpgsql as $$ begin raise exception 'synthetic binding failure'; end $$`);
   await db.execute(sql`create trigger reject_kickoff_binding before insert on onboarding_kickoffs for each row execute function reject_kickoff_binding()`);
   try {
    await expect(prepareOnboardingKickoff(ws!.id,actor,engagementId,db)).rejects.toThrow();
    expect(await db.select().from(s.eventTypes)).toHaveLength(0);
    expect(await db.select().from(s.eventTypeHosts)).toHaveLength(0);
   } finally {await db.execute(sql`drop trigger reject_kickoff_binding on onboarding_kickoffs`);await db.execute(sql`drop function reject_kickoff_binding()`);}
   const prepared=await Promise.all([prepareOnboardingKickoff(ws!.id,actor,engagementId,db),prepareOnboardingKickoff(ws!.id,actor,engagementId,db)]);
   expect(prepared.map(result=>result.kind).sort()).toEqual(["created","reused"]);
   const [event]=await db.select().from(s.eventTypes);if(!event)throw new Error("missing kickoff");
   expect(event).toMatchObject({durationMinutes:45,mode:"group",ownerUserId:organizer,playbookStatus:"draft"});
   expect(await db.select().from(s.eventTypeHosts)).toHaveLength(6);
   expect(await getEventTypeBySlug(event.slug,db,ws!.id)).toBeNull();
   expect(await getEventTypeForBookingById(event.id,db)).toBeNull();
   expect((await getPublicBookingPage(ws!.id,undefined,db))?.eventTypes).toHaveLength(0);
   const start=Temporal.Now.zonedDateTimeISO("UTC").add({days:1}).with({hour:10,minute:0,second:0,millisecond:0,microsecond:0,nanosecond:0}).toInstant();
   const slot={start,end:start.add({minutes:45})};const ttl=Temporal.Duration.from({minutes:10});
   expect(await createHold(event.id,ids,slot,ttl,db)).toEqual({ok:false,error:{kind:"kickoff_not_published"}});
   await db.update(s.eventTypes).set({playbookStatus:"ready",minimumNoticeMin:0}).where(eq(s.eventTypes.id,event.id));
   expect(await getEventTypeBySlug(event.slug,db,ws!.id)).toBeNull();
   await db.insert(s.schedules).values(ids.map(userId=>({userId,timezone:"UTC",rules:Array.from({length:7},(_,i)=>({dow:i+1,start:"08:00",end:"18:00"}))})));
   const connections=await db.insert(s.calendarConnections).values(ids.map(userId=>({userId,externalCalendarId:`synthetic-${userId}`,isWriteDestination:userId===organizer,lastSyncedAt:new Date(),fullSyncedAt:new Date()}))).returning();
   // Test-only publication fixture exercises the future live path. There is
   // deliberately no API that can publish a kickoff in this build.
   await db.update(s.onboardingKickoffs).set({publishedAt:new Date()}).where(eq(s.onboardingKickoffs.eventTypeId,event.id));
   await db.update(s.engagements).set({status:"active"}).where(eq(s.engagements.id,engagementId));
   expect((await getEventTypeBySlug(event.slug,db,ws!.id))?.fixedRoster).toBe(true);
   expect(await createHold(event.id,ids.slice(0,5),slot,ttl,db)).toEqual({ok:false,error:{kind:"kickoff_roster_mismatch"}});
   expect(await db.select().from(s.holds)).toHaveLength(0);
   const claims=await Promise.all([createHold(event.id,ids,slot,ttl,db),createHold(event.id,ids,slot,ttl,db)]);
   expect(claims.filter(result=>result.ok)).toHaveLength(1);
   const claim=claims.find(result=>result.ok);if(!claim?.ok)throw new Error("claim missing");
   const holdIds=claim.value.map(row=>row.id);
   const invitee={email:"franchisee@example.invalid",name:"Alex",timezone:"UTC"};
   expect(await confirmHold(holdIds.slice(1),invitee,db)).toEqual({ok:false,error:{kind:"kickoff_roster_mismatch"}});
   await db.update(s.calendarConnections).set({syncHealthy:false}).where(eq(s.calendarConnections.id,connections[0]!.id));
   expect(await confirmHold(holdIds,invitee,db)).toEqual({ok:false,error:{kind:"kickoff_setup_incomplete"}});
   await db.update(s.calendarConnections).set({syncHealthy:true}).where(eq(s.calendarConnections.id,connections[0]!.id));
   await db.insert(s.calendarBusyCache).values({connectionId:connections[0]!.id,startsAt:new Date(start.epochMilliseconds),endsAt:new Date(slot.end.epochMilliseconds)});
   expect(await confirmHold(holdIds,invitee,db)).toEqual({ok:false,error:{kind:"kickoff_slot_unavailable"}});
   await db.delete(s.calendarBusyCache).where(eq(s.calendarBusyCache.connectionId,connections[0]!.id));
   await db.update(s.engagements).set({status:"paused"}).where(eq(s.engagements.id,engagementId));
   expect(await confirmHold(holdIds,invitee,db)).toEqual({ok:false,error:{kind:"kickoff_engagement_inactive"}});
   expect(await db.select().from(s.bookings)).toHaveLength(0);expect(await db.select().from(s.bookingEvents)).toHaveLength(0);
   await db.update(s.engagements).set({status:"active"}).where(eq(s.engagements.id,engagementId));
   const confirmed=await confirmHold([...holdIds].reverse(),invitee,db);if(!confirmed.ok)throw new Error(JSON.stringify(confirmed));
   expect(confirmed.value.hostUserIds).toHaveLength(6);expect(confirmed.value.hostUserIds[0]).toBe(organizer);
   const bookingId=confirmed.value.bookingId;
   await rebuildProjection(bookingId,db);
   expect((await getBookingById(bookingId,db))?.hostUserIds[0]).toBe(organizer);
   const invite=await getInviteContext(bookingId,db);if(!invite)throw new Error("invite context missing");
   expect(invite.hosts[0]?.id).toBe(organizer);
   const mail=buildMail(invite,"created",Temporal.Now.instant());
   expect(mail.replyTo).toBe(people[4]!.email);expect(mail.cc).toHaveLength(6);
   expect(mail.ics?.content).toContain(`mailto:${people[4]!.email}`);
   await db.update(s.bookings).set({hostUserIds:ids.slice(1)}).where(eq(s.bookings.id,bookingId));
   await expect(getInviteContext(bookingId,db)).rejects.toThrow("kickoff_invitation_roster_unavailable");
   await rebuildProjection(bookingId,db);
   expect((await getInviteContext(bookingId,db))?.hosts).toHaveLength(6);
   const reassigned=await appendEvent(bookingId,"reassigned",{hostUserIds:ids.slice(1)},db);
   expect(reassigned).toEqual({ok:false,error:{kind:"reassigned",reason:"kickoff_roster_mismatch"}});
   const next={start:start.add({hours:24}),end:slot.end.add({hours:24})};
   const nextHolds=await createHold(event.id,ids,next,ttl,db);if(!nextHolds.ok)throw new Error("reschedule holds missing");
   expect(await confirmReschedule(bookingId,nextHolds.value.slice(1).map(row=>row.id),db)).toEqual({ok:false,error:{kind:"kickoff_roster_mismatch"}});
   const rescheduled=await confirmReschedule(bookingId,nextHolds.value.map(row=>row.id),db);
   expect(rescheduled.ok).toBe(true);if(rescheduled.ok)expect(rescheduled.value.hostUserIds[0]).toBe(organizer);
   expect((await getInviteContext(bookingId,db))?.hosts[0]?.id).toBe(organizer);
   await db.update(s.eventTypeHosts).set({role:"optional"}).where(and(eq(s.eventTypeHosts.eventTypeId,event.id),eq(s.eventTypeHosts.userId,ids[0]!)));
   expect(await getEventTypeBySlug(event.slug,db,ws!.id)).toBeNull();
   expect((await prepareOnboardingKickoff(ws!.id,actor,engagementId,db)).kind).toBe("kickoff_configuration_changed");
   expect(await createHold(event.id,ids,{start:start.add({hours:48}),end:slot.end.add({hours:48})},ttl,db)).toEqual({ok:false,error:{kind:"kickoff_configuration_changed"}});
  } finally {await pool.end();}
 });
});

import {describe,expect,test} from "bun:test";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {eq,sql} from "drizzle-orm";
import {franchiseOnboardingInput} from "../../src/core/engagement/franchise-onboarding";
import type {FollowupPreviewInput,FollowupRule} from "../../src/core/engagement/followup-schedule";
import {provisionFranchiseOnboarding,updateOnboardingCadence} from "../../src/db/franchise-onboarding-repo";
import {applyFollowupSchedule,getFollowupSchedule,previewFollowupSchedule} from "../../src/db/followup-schedule-repo";
import * as s from "../../src/db/schema";
const now=new Date("2027-01-01T00:00:00Z");
const rule:FollowupRule={cadence:"biweekly",anchorDate:"2027-01-05",localTime:"10:00",timezone:"America/New_York",monthlyMode:"weekday_position",count:6};
async function fixture() {
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),db=drizzle(pool,{schema:s});
 await migrate(db,{migrationsFolder:"drizzle"});await db.execute(sql`truncate table ${s.users}, ${s.workspaces} restart identity cascade`);
 const people=await db.insert(s.users).values(Array.from({length:7},(_,i)=>({name:`Person ${i}`,email:`followup-${i}@example.invalid`}))).returning();
 const [workspace]=await db.insert(s.workspaces).values({name:"Schedule test",slug:"followup-test"}).returning();const ws=workspace!.id;
 await db.insert(s.workspaceMembers).values(people.map(person=>({workspaceId:ws,userId:person.id,role:"member" as const})));
 const actor={userId:people[0]!.id,workspaceRole:"admin" as const},lead={userId:people[2]!.id,workspaceRole:"member" as const};
 const input=franchiseOnboardingInput.parse({sourceWorkspaceId:crypto.randomUUID(),sourceProjectKey:"followup",locationKey:crypto.randomUUID(),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Schedule Client",locationName:"Sample City",franchiseSuccessUserIds:people.slice(2,6).map(p=>p.id),kaiUserId:people[0]!.id,andrewUserId:people[1]!.id,accountLeadUserId:lead.userId,organizerUserId:lead.userId});
 const created=await provisionFranchiseOnboarding(ws,actor,input,db);if(created.kind!=="created")throw new Error("fixture failed");
 const id=created.onboarding.engagementId;
 async function reviewed(command:FollowupPreviewInput["command"],at=now) {
  const state=await getFollowupSchedule(ws,lead,id,db);if(state.kind!=="found")throw new Error("missing state");
  const input={revision:state.revision,command};const result=await previewFollowupSchedule(ws,lead,id,input,db,at);
  if(result.kind!=="previewed")throw new Error(`preview failed: ${result.kind}`);
  return {...input,previewHash:result.previewHash,requestId:crypto.randomUUID()};
 }
 return {pool,db,ws,id,actor,lead,people,reviewed};
}
describe.skipIf(!process.env.TEST_DATABASE_URL)("follow-up schedules",()=>{
 test("atomic create, concurrent replay, strict preview validation and workspace permissions",async()=>{
  const f=await fixture();try {
   const request=await f.reviewed({action:"configure",rule});
   expect(await f.db.select().from(s.onboardingFollowupSchedules)).toHaveLength(0);
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,{...request,previewHash:"0".repeat(64)},f.db,now)).kind).toBe("preview_changed");
   const results=await Promise.all([applyFollowupSchedule(f.ws,f.lead,f.id,request,f.db,now),applyFollowupSchedule(f.ws,f.lead,f.id,request,f.db,now)]);
   expect(results.map(row=>row.kind).sort()).toEqual(["applied","reused"]);
   const state=await getFollowupSchedule(f.ws,f.lead,f.id,f.db);if(state.kind!=="found")throw new Error("missing");
   expect(state).toMatchObject({revision:2,deliveryState:"not_invited",schedule:{status:"planned"}});expect(state.schedule?.occurrences).toHaveLength(6);
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,{...request,command:{action:"configure",rule:{...rule,cadence:"weekly"}}},f.db,now)).kind).toBe("request_conflict");
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,{...request,requestId:crypto.randomUUID()},f.db,now)).kind).toBe("revision_conflict");
   expect((await getFollowupSchedule(crypto.randomUUID(),f.actor,f.id,f.db)).kind).toBe("not_found");
   expect((await getFollowupSchedule(f.ws,{userId:f.people[6]!.id,workspaceRole:"member"},f.id,f.db)).kind).toBe("not_found");
   expect((await previewFollowupSchedule(f.ws,{userId:f.people[3]!.id,workspaceRole:"member"},f.id,{revision:2,command:{action:"pause"}},f.db,now)).kind).toBe("forbidden");
   expect((await updateOnboardingCadence(f.ws,f.lead,f.id,{revision:2,cadence:"monthly"},f.db)).kind).toBe("schedule_preview_required");
   expect(await f.db.select().from(s.onboardingFollowupChanges)).toHaveLength(1);expect(await f.db.select().from(s.bookings)).toHaveLength(0);expect(await f.db.select().from(s.kickoffDeliveries)).toHaveLength(0);
  }finally{await f.pool.end();}
 });
 test("cadence changes preserve occurrence IDs, exceptions and past records; pause/resume/end remain draft-only",async()=>{
  const f=await fixture();try {
   await applyFollowupSchedule(f.ws,f.lead,f.id,await f.reviewed({action:"configure",rule}),f.db,now);
   let state=await getFollowupSchedule(f.ws,f.lead,f.id,f.db);if(state.kind!=="found"||!state.schedule)throw new Error("missing");
   const ids=state.schedule.occurrences.map(row=>row.id),first=state.schedule.occurrences[0]!;
   const move=await f.reviewed({action:"move",occurrenceId:ids[2]!,date:"2027-02-04",time:"11:00"});
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,move,f.db,now)).kind).toBe("applied");
   const later=new Date("2027-01-06T00:00:00Z");
   const configure=await f.reviewed({action:"configure",rule:{...rule,cadence:"weekly",anchorDate:"2027-01-12",count:3}},later);
   const [one,two]=await Promise.all([applyFollowupSchedule(f.ws,f.lead,f.id,configure,f.db,later),applyFollowupSchedule(f.ws,f.lead,f.id,{...configure,requestId:crypto.randomUUID()},f.db,later)]);
   expect([one.kind,two.kind].sort()).toEqual(["applied","revision_conflict"]);
   state=await getFollowupSchedule(f.ws,f.lead,f.id,f.db);if(state.kind!=="found"||!state.schedule)throw new Error("missing");
   expect(state.schedule.occurrences[0]).toEqual(first);expect(state.schedule.occurrences.map(row=>row.id)).toEqual(ids);
   expect(state.schedule.occurrences[2]).toMatchObject({exception:true,startsAt:"2027-02-04T16:00:00.000Z"});
   expect(state.schedule.occurrences.filter(row=>row.status==="cancelled")).toHaveLength(2);
   for(const action of ["pause","resume","end"] as const) {
    const result=await applyFollowupSchedule(f.ws,f.lead,f.id,await f.reviewed({action},later),f.db,later);
    if(result.kind!=="applied")throw new Error(`lifecycle failed: ${result.kind}`);
    expect(result.schedule?.status).toBe(action==="pause"?"paused":action==="resume"?"planned":"ended");
    expect(result.schedule?.occurrences[0]).toEqual(first);
   }
   const ended=await f.reviewed({action:"resume"},later);
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,ended,f.db,later)).kind).toBe("schedule_invalid");
   expect(await f.db.select().from(s.bookings)).toHaveLength(0);
  }finally{await f.pool.end();}
 });
 test("expired previews and closed Engagements cannot modify a plan; audit failures roll back all writes",async()=>{
  const f=await fixture();try {
   const request=await f.reviewed({action:"configure",rule});
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,request,f.db,new Date("2027-01-06T00:00:00Z"))).kind).toBe("preview_changed");
   await f.db.update(s.engagements).set({status:"paused"}).where(eq(s.engagements.id,f.id));
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,request,f.db,now)).kind).toBe("engagement_paused");
   await f.db.update(s.engagements).set({status:"completed"}).where(eq(s.engagements.id,f.id));
   expect((await applyFollowupSchedule(f.ws,f.lead,f.id,request,f.db,now)).kind).toBe("engagement_closed");
   await f.db.update(s.engagements).set({status:"draft"}).where(eq(s.engagements.id,f.id));
   await f.db.execute(sql`create function reject_followup_test() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$`);
   await f.db.execute(sql`create trigger reject_followup_test before insert on onboarding_followup_changes for each row execute function reject_followup_test()`);
   await expect(applyFollowupSchedule(f.ws,f.lead,f.id,request,f.db,now)).rejects.toThrow();
   expect(await f.db.select().from(s.onboardingFollowupSchedules)).toHaveLength(0);expect(await f.db.select().from(s.onboardingFollowupOccurrences)).toHaveLength(0);
   expect((await f.db.select().from(s.franchiseOnboarding))[0]?.revision).toBe(1);expect(await f.db.select().from(s.franchiseOnboardingChanges)).toHaveLength(1);
  }finally{await f.db.execute(sql`drop trigger if exists reject_followup_test on onboarding_followup_changes`);await f.db.execute(sql`drop function if exists reject_followup_test()`);await f.pool.end();}
 });
});

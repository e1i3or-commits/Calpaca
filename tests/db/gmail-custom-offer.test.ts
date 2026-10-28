import { describe,expect,test } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Temporal } from "@js-temporal/polyfill";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createEventType } from "../../src/db/admin-repo";
import { createOneOffOffer } from "../../src/db/one-off-offer-repo";
import { createHold,confirmHold } from "../../src/db/holds-repo";
describe.skipIf(!process.env.TEST_DATABASE_URL)("custom one-off confirmation",()=>{
 test("books the offered 45 minutes once and preserves the regular 30-minute link",async()=>{
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});const db=drizzle(pool,{schema});
  try {
   await migrate(db,{migrationsFolder:"drizzle"});
   const key=crypto.randomUUID();
   const [workspace]=await db.insert(schema.workspaces).values({name:"Gmail test",slug:key}).returning();
   const [host]=await db.insert(schema.users).values({name:"Host",email:`${key}@example.test`}).returning();
   const event=await createEventType(host!.id,{title:"Regular",slug:key,durationMinutes:30,mode:"solo",bufferBeforeMin:0,bufferAfterMin:0,minimumNoticeMin:0,rollingWindowDays:90,scheduleId:null,teamId:null,hosts:[{userId:host!.id,role:"member",weight:100}]},db,workspace!.id);
   if(typeof event==="string")throw Error(event);
   const start=Temporal.Instant.fromEpochMilliseconds(Date.now()).add({hours:24});
   const slot={start,end:start.add({minutes:45})};
   const offer=await createOneOffOffer({workspaceId:workspace!.id,ownerUserId:host!.id,eventTypeId:event.id,title:"Custom",message:null,recipientEmail:null,slots:[{start:slot.start.toString(),end:slot.end.toString()}],expiresAt:new Date(slot.end.epochMilliseconds)},db);
   const hold=await createHold(event.id,[host!.id],slot,Temporal.Duration.from({minutes:10}),db);if(!hold.ok||!offer)throw Error("fixture failed");
   const booked=await confirmHold(hold.value.map(h=>h.id),{name:"Invitee",email:"invitee@example.test",timezone:"UTC"},db,undefined,undefined,undefined,undefined,offer.publicId);
   expect(booked.ok).toBe(true);
   const [saved]=await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id,event.id));expect(saved!.durationMinutes).toBe(30);
   const [stored]=await db.select().from(schema.oneOffOffers).where(eq(schema.oneOffOffers.id,offer.id));expect(stored!.status).toBe("booked");
  }finally{await pool.end();}
 });
});

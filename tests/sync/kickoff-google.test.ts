import {expect,test} from "bun:test";
import type {Delivery} from "../../src/db/kickoff-delivery-repo";
import {syncKickoffGoogle} from "../../src/sync/kickoff-google";

const fixture=()=>({id:"delivery-1",sequence:1,googleEventId:"c123",kind:"created",snapshot:{eventTypeTitle:"Kickoff",hosts:[{id:"organizer",email:"host@example.invalid",name:"Host"},...Array.from({length:5},(_,i)=>({email:`team-${i}@example.invalid`,name:`Team ${i}`}))],
  booking:{id:"booking-1",inviteeEmail:"guest@example.invalid",inviteeName:"Guest",startsAt:"2027-01-04T10:00:00Z",endsAt:"2027-01-04T10:45:00Z",meetingFormat:"google_meet"}}} as unknown as Delivery);

test("a lost Google insert response is recovered by ID and readback without a second invitation",async()=>{
 let event:Record<string,unknown>|null=null;let writes=0;
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="POST") {writes++;event={...JSON.parse(String(options.body)),etag:'"v1"',organizer:{email:"host@example.invalid"},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};throw new Error("lost response after provider commit");}
  return event?Response.json(event):new Response(null,{status:404});
 }) as unknown as typeof fetch;
 const row=fixture();
 await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_outcome_unknown",retryable:true});
 await syncKickoffGoogle(row,"primary","synthetic",request);
 expect(writes).toBe(1);
});

test("incomplete roster readback never counts as success or resends the same native invitation",async()=>{
 const row=fixture();let writes=0;
 const request=(async()=>Response.json({id:row.googleEventId,etag:'"v1"',organizer:{email:"host@example.invalid"},start:{dateTime:row.snapshot.booking.startsAt},end:{dateTime:row.snapshot.booking.endsAt},attendees:[],extendedProperties:{private:{tourscaleBookingId:"booking-1",tourscaleDeliveryId:row.id}},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}})) as unknown as typeof fetch;
 const counted=(async(...args:Parameters<typeof fetch>)=>{if(args[1]?.method)writes++;return request(...args);}) as unknown as typeof fetch;
 await expect(syncKickoffGoogle(row,"primary","synthetic",counted)).rejects.toMatchObject({code:"calendar_readback_incomplete"});expect(writes).toBe(0);
});

test("a reschedule never overwrites an event owned by another booking",async()=>{
 const row={...fixture(),kind:"rescheduled" as const,sequence:2};
 const request=(async()=>Response.json({id:row.googleEventId,etag:'"v1"',extendedProperties:{private:{tourscaleBookingId:"some-other-booking"}}})) as unknown as typeof fetch;
 await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_identity_conflict"});
});

test("duplicate attendee entries cannot stand in for missing required people",async()=>{
 const row=fixture();
 const request=(async()=>Response.json({id:row.googleEventId,organizer:{email:"host@example.invalid"},start:{dateTime:row.snapshot.booking.startsAt},end:{dateTime:row.snapshot.booking.endsAt},
  attendees:Array.from({length:6},()=>({email:"guest@example.invalid"})),extendedProperties:{private:{tourscaleBookingId:"booking-1",tourscaleDeliveryId:row.id}},
  conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}})) as unknown as typeof fetch;
 await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_readback_incomplete"});
});

test("reschedules use conditional updates and recover a lost PATCH response without resending",async()=>{
 const row={...fixture(),kind:"rescheduled" as const,sequence:2};let writes=0;
 let event:Record<string,unknown>={id:row.googleEventId,etag:'"v1"',organizer:{email:"host@example.invalid"},extendedProperties:{private:{tourscaleBookingId:"booking-1",tourscaleDeliveryId:"older",tourscaleSequence:"1"}},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="PATCH") {
   expect(new Headers(options.headers).get("If-Match")).toBe('"v1"');writes++;
   event={...event,...JSON.parse(String(options.body)),etag:'"v2"'};throw new Error("lost patch response");
  }
  return Response.json(event);
 }) as unknown as typeof fetch;
 await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_outcome_unknown"});
 await syncKickoffGoogle(row,"primary","synthetic",request);expect(writes).toBe(1);
});

test("cancellation is verified by readback and an already deleted event is not deleted twice",async()=>{
 const row={...fixture(),kind:"cancelled" as const};let writes=0,deleted=false;
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="DELETE") {expect(new Headers(options.headers).get("If-Match")).toBe('"v1"');writes++;deleted=true;throw new Error("lost delete response");}
  return deleted?new Response(null,{status:410}):Response.json({id:row.googleEventId,etag:'"v1"',extendedProperties:{private:{tourscaleBookingId:"booking-1"}}});
 }) as unknown as typeof fetch;
 await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_outcome_unknown"});
 await syncKickoffGoogle(row,"primary","synthetic",request);expect(writes).toBe(1);
});

test("follow-up leadership flags survive provider write and readback; a changed flag is rejected",async()=>{
 const base=fixture();const row:Delivery={...base,snapshot:{...base.snapshot,hosts:base.snapshot.hosts.map((host,i)=>({...host,role:i>3?"optional":"required"}))}};
 let event:Record<string,unknown>|null=null,writes=0;
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="POST"){writes++;event={...JSON.parse(String(options.body)),etag:'"v1"',organizer:{email:"host@example.invalid"},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};}
  return event?Response.json(event):new Response(null,{status:404});
 }) as unknown as typeof fetch;
 await syncKickoffGoogle(row,"primary","synthetic",request);
 const attendees=event!.attendees as {email:string;optional:boolean}[];
 expect(attendees.filter(person=>person.optional).map(person=>person.email)).toEqual(["team-3@example.invalid","team-4@example.invalid"]);
 expect(attendees).toHaveLength(7);
 attendees.find(person=>person.optional)!.optional=false;
 await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_readback_incomplete"});expect(writes).toBe(1);
});

test("a secondary organizing calendar still invites the human Franchise Success organizer",async()=>{
 const row=fixture();let event:Record<string,unknown>|null=null;
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="POST")event={...JSON.parse(String(options.body)),etag:'"v1"',organizer:{email:"team-calendar@example.invalid"},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
  return event?Response.json(event):new Response(null,{status:404});
 }) as unknown as typeof fetch;
 await syncKickoffGoogle(row,"team-calendar@example.invalid","synthetic",request);
 expect(event!.attendees).toContainEqual({email:"host@example.invalid",displayName:"Host",optional:false});
 expect(event!.attendees).toHaveLength(7);
});

test("a contact change swaps the invitee on the same event and notifies only external guests",async()=>{
 const base=fixture();
 const row={...base,kind:"rescheduled" as const,sequence:2,snapshot:{...base.snapshot,deliveryReason:"invitee_changed" as const,booking:{...base.snapshot.booking,inviteeEmail:"owner@brand.example",inviteeName:"Owner"}}} as Delivery;
 let event:Record<string,unknown>={id:row.googleEventId,etag:'"v1"',organizer:{email:"host@example.invalid"},start:{dateTime:row.snapshot.booking.startsAt},end:{dateTime:row.snapshot.booking.endsAt},
  attendees:[{email:"guest@example.invalid"}],extendedProperties:{private:{tourscaleBookingId:"booking-1",tourscaleDeliveryId:"older",tourscaleSequence:"1"}},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
 const urls:string[]=[];
 const request=(async(url:unknown,options?:RequestInit)=>{
  if(options?.method==="PATCH") {urls.push(String(url));event={...event,...JSON.parse(String(options.body)),etag:'"v2"'};}
  return Response.json(event);
 }) as unknown as typeof fetch;
 await syncKickoffGoogle(row,"primary","synthetic",request);
 expect(urls).toHaveLength(1);expect(urls[0]).toContain("sendUpdates=externalOnly");
 const attendees=(event.attendees as {email:string}[]).map(person=>person.email);
 expect(attendees).toContain("owner@brand.example");expect(attendees).not.toContain("guest@example.invalid");
});

function legacyEvent(row:Delivery) {
 return {id:row.googleEventId,etag:'"legacy"',organizer:{email:"host@example.invalid"},
  start:{dateTime:row.snapshot.booking.startsAt},end:{dateTime:row.snapshot.booking.endsAt},
  attendees:[{email:row.snapshot.booking.inviteeEmail,optional:false},...row.snapshot.hosts.slice(1).map(host=>({email:host.email,optional:host.role==="optional"}))],
  extendedProperties:{private:{tourscaleBookingId:row.snapshot.booking.id,tourscaleDeliveryId:row.id,tourscaleSequence:String(row.sequence)}},
  conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
}

for(const calendarId of ["primary","HOST@example.invalid","team-calendar@example.invalid"]) {
 test(`new roster includes the human organizer once on ${calendarId}`,async()=>{
  const row=fixture();let event:Record<string,unknown>|null=null;
  const request=(async(_url:unknown,options?:RequestInit)=>{
   if(options?.method==="POST")event={...JSON.parse(String(options.body)),etag:'"v1"',organizer:{email:calendarId==="primary"?"host@example.invalid":calendarId},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
   return event?Response.json(event):new Response(null,{status:404});
  }) as unknown as typeof fetch;
  await syncKickoffGoogle(row,calendarId,"synthetic",request);
  const attendees=event!.attendees as {email:string;displayName?:string;optional:boolean;organizer?:boolean;self?:boolean}[];
  expect(attendees.filter(person=>person.email.toLowerCase()==="host@example.invalid")).toEqual([{email:"host@example.invalid",displayName:"Host",optional:false}]);
  expect(attendees).toHaveLength(7);
  expect(attendees.every(person=>person.organizer===undefined&&person.self===undefined)).toBe(true);
  expect((event!.extendedProperties as {private:Record<string,string>}).private.tourscaleAttendeeRosterVersion).toBe("1");
  if(calendarId==="team-calendar@example.invalid")expect(attendees.some(person=>person.email===calendarId)).toBe(false);
 });
}

test("case-insensitive organizer and guest overlap is deduplicated without losing optional hosts",async()=>{
 const base=fixture();
 const row:Delivery={...base,snapshot:{...base.snapshot,hosts:base.snapshot.hosts.map((host,i)=>({...host,role:i===1?"optional":"required"})),booking:{...base.snapshot.booking,inviteeEmail:"HOST@example.invalid",guestEmails:["host@example.invalid","TEAM-0@example.invalid","extra@example.invalid","EXTRA@example.invalid"]}}};
 let event:Record<string,unknown>|null=null;
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="POST")event={...JSON.parse(String(options.body)),organizer:{email:"host@example.invalid"},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
  return event?Response.json(event):new Response(null,{status:404});
 }) as unknown as typeof fetch;
 await syncKickoffGoogle(row,"primary","synthetic",request);
 const attendees=event!.attendees as {email:string;optional:boolean}[];
 expect(attendees).toHaveLength(7);
 expect(new Set(attendees.map(person=>person.email.toLowerCase())).size).toBe(7);
 expect(attendees.filter(person=>person.email.toLowerCase()==="host@example.invalid")).toHaveLength(1);
 expect(attendees.find(person=>person.email==="team-0@example.invalid")?.optional).toBe(true);
});

for(const keepMarker of [true,false]) {
 test(`write readback missing organizer fails even with roster marker ${keepMarker?"retained":"omitted"}`,async()=>{
  const row=fixture();let event:Record<string,unknown>|null=null,writes=0;
  const request=(async(_url:unknown,options?:RequestInit)=>{
   if(options?.method==="POST") {
    writes++;const body=JSON.parse(String(options.body));
    body.attendees=body.attendees.filter((person:{email:string})=>person.email!=="host@example.invalid");
    if(!keepMarker)delete body.extendedProperties.private.tourscaleAttendeeRosterVersion;
    event={...body,organizer:{email:"host@example.invalid"},conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/test-meet"}]}};
   }
   return event?Response.json(event):new Response(null,{status:404});
  }) as unknown as typeof fetch;
  await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_write_unverified"});
  expect(writes).toBe(1);
  if(keepMarker) {
   await expect(syncKickoffGoogle(row,"primary","synthetic",request)).rejects.toMatchObject({code:"calendar_readback_incomplete"});
   expect(writes).toBe(1);
  }
 });
}

for(const kind of ["created","reminder"] as const) {
 test(`legacy ${kind} readback remains valid without organizer attendance or a write`,async()=>{
  const row={...fixture(),kind};const event=legacyEvent(row);let writes=0;
  if(kind==="reminder")event.extendedProperties.private.tourscaleDeliveryId="older-invite-delivery";
  const request=(async(_url:unknown,options?:RequestInit)=>{if(options?.method)writes++;return Response.json(event);}) as unknown as typeof fetch;
  await syncKickoffGoogle(row,"primary","synthetic",request);
  expect(writes).toBe(0);
  expect(event.attendees.some(person=>person.email==="host@example.invalid")).toBe(false);
 });
}

test("the next reschedule upgrades a legacy roster with one conditional PATCH",async()=>{
 const old=fixture(),row={...old,id:"delivery-2",kind:"rescheduled" as const,sequence:2};
 let event:Record<string,unknown>=legacyEvent(old),writes=0;
 const request=(async(_url:unknown,options?:RequestInit)=>{
  if(options?.method==="PATCH") {
   expect(new Headers(options.headers).get("If-Match")).toBe('"legacy"');writes++;
   event={...event,...JSON.parse(String(options.body)),etag:'"v2"'};
  }
  return Response.json(event);
 }) as unknown as typeof fetch;
 await syncKickoffGoogle(row,"primary","synthetic",request);
 await syncKickoffGoogle(row,"primary","synthetic",request);
 expect(writes).toBe(1);
 expect((event.attendees as {email:string}[]).filter(person=>person.email==="host@example.invalid")).toHaveLength(1);
 expect((event.extendedProperties as {private:Record<string,string>}).private.tourscaleAttendeeRosterVersion).toBe("1");
});

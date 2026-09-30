import {expect,test} from "bun:test";
import type {MiddlewareHandler} from "hono";
import type {AuthEnv} from "../../src/auth/session";
import {createOnboardingMeetingRoutes,type OnboardingMeetingsDeps} from "../../src/api/routes/onboarding-meetings";
import {findGeminiNotes,MeetingNotesLookupError} from "../../src/sync/meeting-notes-google";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const now=new Date("2026-09-30T18:30:00Z");
const meeting=(n:number,organizer=id(7))=>({bookingId:id(n),sourceProjectKey:"cruisin-tikis-jacksonville-new-launch",sourceWorkspaceId:id(8),startsAt:"2026-09-30T17:00:00.000Z",endsAt:"2026-09-30T17:45:00.000Z",calendar:{organizerUserId:organizer,calendarId:"primary",eventId:`c${n}`}});
function deps(role:"admin"|"member"|"anonymous"="admin"):OnboardingMeetingsDeps {
 const requireAuth:MiddlewareHandler<AuthEnv>=async(c,next)=>{if(role==="anonymous")return c.json({error:"unauthorized"},401);c.set("user",{id:id(1),name:"Operator",email:"operator@example.invalid",workspaceId:id(2),workspaceRole:role});await next();};
 return {requireAuth,now:()=>now,list:async()=>({meetings:[],nextCursor:null}),accessToken:async()=>"synthetic",notes:async()=>null};
}
const path=(since="2026-09-29T00:00:00Z")=>`/api/automation/onboarding-meetings/ended?since=${encodeURIComponent(since)}`;
test("ended meetings require an administrator, a bounded window and disable caching",async()=>{
 for(const role of ["anonymous","member"] as const)expect((await createOnboardingMeetingRoutes(deps(role)).request(path())).status).not.toBe(200);
 const app=createOnboardingMeetingRoutes(deps());
 expect((await app.request("/api/automation/onboarding-meetings/ended")).status).toBe(400);
 expect((await app.request(path("2026-09-01T00:00:00Z"))).status).toBe(400);
 const ok=await app.request(path());expect(ok.status).toBe(200);expect(ok.headers.get("cache-control")).toBe("no-store");
});
test("each meeting reports its notes or a named issue, and waits for the notes to settle",async()=>{
 const d=deps();let window:unknown;const asked:string[]=[];
 d.list=async(workspaceId,since,until)=>{window={workspaceId,since:since.toISOString(),until:until.toISOString()};return {meetings:[meeting(3),meeting(4),meeting(5,id(9))],nextCursor:null};};
 d.accessToken=async(userId)=>userId===id(9)?null:"synthetic";
 d.notes=async(_cal,eventId)=>{asked.push(eventId);if(eventId==="c4")throw new MeetingNotesLookupError("calendar_http_403");return {fileId:"1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",title:"Onboarding follow-up - Notes by Gemini",url:"https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"};};
 const body=await (await createOnboardingMeetingRoutes(d).request(path())).json() as {meetings:{sourceKey:string;notes:unknown;issue:string|null}[]};
 expect(window).toEqual({workspaceId:id(2),since:"2026-09-29T00:00:00.000Z",until:"2026-09-30T18:10:00.000Z"});
 expect(body.meetings.map(m=>[m.sourceKey,!!m.notes,m.issue])).toEqual([[`calpaca:booking:${id(3)}`,true,null],[`calpaca:booking:${id(4)}`,false,"calendar_http_403"],[`calpaca:booking:${id(5)}`,false,"organizer_calendar_unavailable"]]);
 expect(asked).toEqual(["c3","c4"]);
});
test("only a Google document titled Notes by Gemini counts as the meeting notes",async()=>{
 const reply=(attachments:unknown[],status=200)=>(async()=>new Response(JSON.stringify({attachments}),{status})) as unknown as typeof fetch;
 const doc={mimeType:"application/vnd.google-apps.document",fileId:"1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",title:"Onboarding follow-up - 2026/09/30 - Notes by Gemini"};
 expect(await findGeminiNotes("primary","c1","t",reply([doc]))).toEqual({fileId:doc.fileId,title:doc.title,url:`https://docs.google.com/document/d/${doc.fileId}`});
 expect(await findGeminiNotes("primary","c1","t",reply([{...doc,title:"Agenda"},{...doc,mimeType:"application/pdf"},{...doc,fileId:"../x"}]))).toBeNull();
 expect(await findGeminiNotes("primary","c1","t",reply([],404))).toBeNull();
 await expect(findGeminiNotes("primary","c1","t",reply([],500))).rejects.toMatchObject({code:"calendar_http_500"});
});

test("historical recovery uses bounded frozen windows and returns cursors even on an empty page",async()=>{
 const d=deps(); const cursor={endsAt:"2026-08-02T10:00:00.000Z",bookingId:id(50)};
 let received:unknown;
 d.list=async(ws,from,until,after)=>{received={ws,from:from.toISOString(),until:until.toISOString(),after};return {meetings:[],nextCursor:cursor};};
 const app=createOnboardingMeetingRoutes(d);
 const url=path("2026-08-01T00:00:00Z")+"&until=2026-08-03T00:00:00Z";
 const r=await app.request(url); expect(r.status).toBe(200);
 expect(await r.json()).toMatchObject({until:"2026-08-03T00:00:00.000Z",meetings:[],nextCursor:cursor});
 expect(received).toMatchObject({ws:id(2),after:null});
 expect((await app.request(url+`&afterEndsAt=${cursor.endsAt}&afterBookingId=${cursor.bookingId}`)).status).toBe(200);
 expect(received).toMatchObject({after:cursor});
 for(const bad of [
  path()+`&afterEndsAt=${now.toISOString()}&afterBookingId=${id(2)}`,
  url+`&afterBookingId=${id(2)}`,
  url+`&afterEndsAt=2026-08-01T00:00:00Z&afterBookingId=${id(2)}`,
  url+`&afterEndsAt=2026-08-04T00:00:00Z&afterBookingId=${id(2)}`,
  url+"&afterEndsAt=2026-08-02T00:00:00Z&afterBookingId=bad",
  path()+"&until=2026-09-30T18:11:00Z",
  path()+"&until=2026-09-28T00:00:00Z",
  path("2026-08-01T00:00:00Z")+"&until=2026-08-16T00:00:00Z",
 ]) expect((await app.request(bad)).status).toBe(400);
});

test("one organizer token failure is cached per page and cannot hide another organizer's meeting",async()=>{
 const d=deps();let attempts=0;
 d.list=async()=>({meetings:[meeting(3),meeting(4),meeting(5,id(9))],nextCursor:null});
 d.accessToken=async(user)=>{attempts++;if(user===id(7))throw new Error("provider refresh unavailable");return "synthetic";};
 const r=await createOnboardingMeetingRoutes(d).request(path());expect(r.status).toBe(200);
 const body=await r.json() as {meetings:{issue:string|null}[]};
 expect(body.meetings.map(m=>m.issue)).toEqual(["organizer_calendar_unavailable","organizer_calendar_unavailable",null]);
 expect(attempts).toBe(2);
});

test("queue endpoints enforce admin access, validate leases, and preserve claimed lookup failures",async()=>{
 const d=deps();const job={bookingId:id(3),leaseToken:id(4),attempts:1};let accepted=true;let receipt:unknown;
 d.queue={claim:async()=>job,read:async()=>meeting(3),finish:async(...args)=>{receipt=args.slice(0,4);return accepted;},health:async()=>({worker:null,pending:0,failed:0,expired:0,oldest_due:null})};
 d.accessToken=async()=>{throw new Error("refresh unavailable");};
 const root="/api/automation/onboarding-meetings";
 const post=(body:unknown)=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const app=createOnboardingMeetingRoutes(d);
 const claim=await app.request(root+"/claim",post({since:"2026-09-27T00:00:00Z"}));expect(claim.status).toBe(200);
 expect(await claim.json()).toMatchObject({job,meetings:[{bookingId:id(3),issue:"organizer_calendar_unavailable"}]});
 expect((await app.request(root+"/claim",post({since:"2027-01-01T00:00:00Z"}))).status).toBe(400);
 expect((await app.request(root+"/finish",post({...job,outcome:"complete"}))).status).toBe(400); // attempts is not receipt input
 const body={bookingId:job.bookingId,leaseToken:job.leaseToken,outcome:"failed"};
 expect((await app.request(root+"/finish",post(body))).status).toBe(200);
 expect(receipt).toEqual([id(2),id(3),id(4),"failed"]);
 accepted=false;expect((await app.request(root+"/finish",post(body))).status).toBe(409);
 for(const role of ["anonymous","member"] as const){
  const denied=createOnboardingMeetingRoutes({...deps(role),queue:d.queue});
  for(const endpoint of ["claim","finish","health"]){
   const r=await denied.request(root+"/"+endpoint,endpoint==='health'?{}:post(body));expect(r.status).toBe(role==='anonymous'?401:403);
  }
 }
 d.queue!.claim=async()=>null;
 expect(await (await app.request(root+"/claim",post({since:"2026-09-27T00:00:00Z"}))).json()).toMatchObject({job:null,meetings:[]});
 d.queue!.claim=async()=>{throw new Error("meeting_notes_start_conflict");};
 expect((await app.request(root+"/claim",post({since:"2026-09-27T00:00:00Z"}))).status).toBe(409);
});

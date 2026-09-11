import {expect,test} from "bun:test";
import type {MiddlewareHandler} from "hono";
import type {AuthEnv} from "../../src/auth/session";
import {createFollowupScheduleRoutes,type FollowupScheduleDeps} from "../../src/api/routes/followup-schedule";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function deps(auth=true):FollowupScheduleDeps {
 const requireAuth:MiddlewareHandler<AuthEnv>=async(c,next)=>{if(!auth)return c.json({error:"unauthorized"},401);c.set("user",{id:id(1),name:"Lead",email:"lead@example.invalid",workspaceId:id(2),workspaceRole:"member"});await next();};
 return {requireAuth,get:async()=>({kind:"not_found"}),preview:async()=>({kind:"forbidden"}),apply:async()=>({kind:"revision_conflict"})};
}
const path=`/api/me/engagements/${id(3)}/followup-schedule`;
const configure={revision:1,command:{action:"configure",rule:{cadence:"biweekly",anchorDate:"2027-01-05",localTime:"10:00",timezone:"America/New_York",monthlyMode:"weekday_position",count:6}}};
test("all schedule endpoints require authentication and return no-store responses",async()=>{
 const app=createFollowupScheduleRoutes(deps(false));
 for(const [route,method] of [[path,"GET"],[`${path}/preview`,"POST"],[`${path}/apply`,"POST"]]){const response=await app.request(route!,{method});expect(response.status).toBe(401);expect(response.headers.get("cache-control")).toBe("no-store");}
});
test("schedule preview uses session workspace and rejects field, duration and publication overrides",async()=>{
 let received:unknown;const d=deps();d.preview=async(workspaceId,actor,engagementId,input)=>{received={workspaceId,actor,engagementId,input};return {kind:"forbidden"};};const app=createFollowupScheduleRoutes(d);
 const post=(body:unknown)=>app.request(`${path}/preview?workspaceId=${id(99)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 expect((await post(configure)).status).toBe(403);expect(received).toMatchObject({workspaceId:id(2),actor:{userId:id(1)},engagementId:id(3)});
 for(const body of [{...configure,workspaceId:id(99)},{...configure,command:{...configure.command,publish:true}},{...configure,command:{...configure.command,rule:{...configure.command.rule,durationMinutes:90}}}])expect((await post(body)).status).toBe(400);
});
test("applying requires both a reviewed hash and idempotency ID; repository conflicts stay explicit",async()=>{
 const app=createFollowupScheduleRoutes(deps());
 const post=(body:unknown)=>app.request(`${path}/apply`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 expect((await post(configure)).status).toBe(400);
 const response=await post({...configure,requestId:id(4),previewHash:"a".repeat(64)});expect(response.status).toBe(409);expect(await response.json()).toEqual({error:"revision_conflict"});
 expect((await app.request(path)).status).toBe(404);
});

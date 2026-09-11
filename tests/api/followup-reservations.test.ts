import {expect,test} from "bun:test";
import type {MiddlewareHandler} from "hono";
import type {AuthEnv} from "../../src/auth/session";
import {createFollowupReservationRoutes,type FollowupReservationDeps} from "../../src/api/routes/followup-reservations";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function deps(role:"admin"|"member"|"anonymous"="admin"):FollowupReservationDeps {
 const requireAuth:MiddlewareHandler<AuthEnv>=async(c,next)=>{if(role==="anonymous")return c.json({error:"unauthorized"},401);c.set("user",{id:id(1),name:"Operator",email:"operator@example.invalid",workspaceId:id(2),workspaceRole:role});await next();};
 return {requireAuth,get:async()=>({kind:"not_found"}),prepare:async()=>({kind:"configuration_changed"}),reserve:async()=>({kind:"blocked",occurrenceId:id(4),issueCode:"followup_not_enabled",ownerUserId:id(5)})};
}
const path=`/api/automation/followup-reservations/${id(3)}`;
test("reservation endpoints require administrator authentication and disable caching",async()=>{
 for(const role of ["anonymous","member"] as const){const app=createFollowupReservationRoutes(deps(role));for(const [url,method] of [[path,"GET"],[path,"POST"],[`${path}/${id(4)}/reserve`,"POST"]]){const response=await app.request(url!,{method});expect(response.status).toBe(role==="anonymous"?401:403);expect(response.headers.get("cache-control")).toBe("no-store");}}
});
test("reservation accepts only revision, scopes to session and returns assigned blocked details",async()=>{
 const d=deps();let received:unknown;d.reserve=async(workspaceId,actor,engagementId,occurrenceId,revision)=>{received={workspaceId,actor,engagementId,occurrenceId,revision};return {kind:"blocked",occurrenceId,issueCode:"followup_not_enabled",ownerUserId:id(5)};};const app=createFollowupReservationRoutes(d);
 const post=(body:unknown)=>app.request(`${path}/${id(4)}/reserve?workspaceId=${id(99)}`,{method:"POST",body:JSON.stringify(body)});
 for(const body of [{},{revision:0},{revision:2,email:"override@example.invalid"},{revision:2,enabled:true},{revision:2,startsAt:"2027-01-01"}])expect((await post(body)).status).toBe(400);
 const response=await post({revision:2});expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:"blocked",issueCode:"followup_not_enabled",ownerUserId:id(5)});
 expect(received).toMatchObject({workspaceId:id(2),actor:{userId:id(1)},engagementId:id(3),occurrenceId:id(4),revision:2});
 expect((await app.request(path,{method:"POST",body:'{"enabled":true}'})).status).toBe(400);
});

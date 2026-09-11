import {expect,test} from "bun:test";
import type {MiddlewareHandler} from "hono";
import type {AuthEnv} from "../../src/auth/session";
import {createKickoffDeliveryRoutes,type KickoffDeliveryApiDeps} from "../../src/api/routes/kickoff-delivery";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function deps(role:"admin"|"member"|null):KickoffDeliveryApiDeps {
 const requireAuth:MiddlewareHandler<AuthEnv>=async(c,next)=>{if(!role)return c.json({error:"unauthorized"},401);c.set("user",{id:id(1),name:"Admin",email:"admin@example.invalid",workspaceId:id(2),workspaceRole:role});await next();};
 return {requireAuth,secret:()=>"synthetic-feedback-secret",report:async()=>({checkedAt:new Date().toISOString(),workerStale:true,lastSweepAt:null,attention:0,reservationAttention:0,overdue:0,deliveries:[]}),receipt:async()=>({kind:"recorded"}),retry:async()=>({kind:"queued"})};
}
test("delivery reporting and retry require an administrator and use only the authenticated workspace",async()=>{
 for(const [role,status] of [[null,401],["member",403]] as const) {
  const d=deps(role);let called=false;d.report=async()=>{called=true;throw new Error("must not query");};d.retry=async()=>{called=true;throw new Error("must not retry");};
  const app=createKickoffDeliveryRoutes(d);
  for(const [path,method] of [["/api/automation/kickoff-deliveries","GET"],[`/api/automation/kickoff-deliveries/${id(3)}/retry`,"POST"]]) {
   const response=await app.request(path!,{method});expect(response.status).toBe(status);expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(called).toBe(false);
 }
 const d=deps("admin");let received:unknown;d.retry=async(workspaceId,deliveryId,actorUserId)=>{received={workspaceId,deliveryId,actorUserId};return {kind:"retry_requires_reconciliation"};};
 const response=await createKickoffDeliveryRoutes(d).request(`/api/automation/kickoff-deliveries/${id(3)}/retry?workspaceId=${id(99)}`,{method:"POST"});
 expect(response.status).toBe(409);expect(received).toEqual({workspaceId:id(2),deliveryId:id(3),actorUserId:id(1)});
});
test("feedback requires its own secret and a strict recipient-specific receipt",async()=>{
 const d=deps(null);let received:unknown;d.receipt=async input=>{received=input;return {kind:"receipt_mismatch"};};const app=createKickoffDeliveryRoutes(d);
 const input={deliveryId:id(3),messageId:"<synthetic-message>",providerEventId:"event-1",recipient:"Person@Example.Invalid",status:"delivered"};
 const post=(body:unknown,token?:string)=>app.request("/api/webhooks/kickoff-delivery",{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 expect((await post(input)).status).toBe(401);expect((await post(input,"wrong")).status).toBe(401);expect(received).toBeUndefined();
 expect((await post({...input,workspaceId:id(99)},"synthetic-feedback-secret")).status).toBe(400);
 expect((await post({...input,recipient:undefined},"synthetic-feedback-secret")).status).toBe(400);
 const response=await post(input,"synthetic-feedback-secret");expect(response.status).toBe(409);expect(response.headers.get("cache-control")).toBe("no-store");
 expect(received).toEqual({...input,recipient:"person@example.invalid"});
 d.secret=()=>undefined;expect((await post(input,"synthetic-feedback-secret")).status).toBe(404);
});

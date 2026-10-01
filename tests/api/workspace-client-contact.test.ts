import {expect,test} from "bun:test";
import type {MiddlewareHandler} from "hono";
import type {AuthEnv} from "../../src/auth/session";
import {createWorkspaceClientContactRoutes} from "../../src/api/routes/workspace-client-contact";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const input={requestId:id(4),sourceWorkspaceId:id(5),sourceProjectKey:"test",locationKey:id(6),primaryContactId:"1234567890123456789",name:"Client",email:"client@brand.example",previousEmail:"client@example.invalid",accountId:id(7),googleUserId:"123456789012345678901",verifiedAt:new Date().toISOString()};
const path=`/api/automation/franchise-onboarding/${id(3)}/workspace-contact`;
test("mailbox synchronization requires an administrator and strict input, scoped to the authenticated workspace",async()=>{
 for(const role of ["anonymous","member","admin"] as const){
  let received:unknown;
  const requireAuth:MiddlewareHandler<AuthEnv>=async(c,next)=>{if(role==="anonymous")return c.json({error:"unauthorized"},401);c.set("user",{id:id(1),name:"Operator",email:"operator@example.invalid",workspaceId:id(2),workspaceRole:role});await next();};
  const app=createWorkspaceClientContactRoutes({requireAuth,sync:async(workspaceId,actor,engagementId,body)=>{received={workspaceId,actor,engagementId,body};return {kind:"workspace_evidence_stale"};}});
  const response=await app.request(path+`?workspaceId=${id(99)}`,{method:"PUT",body:JSON.stringify(input)});
  expect(response.headers.get("cache-control")).toBe("no-store");expect(response.status).toBe(role==="anonymous"?401:role==="member"?403:409);
  if(role!=="admin")expect(received).toBeUndefined();
  else{
   expect(received).toMatchObject({workspaceId:id(2),actor:{userId:id(1)},engagementId:id(3),body:input});
   expect((await app.request(path,{method:"PUT",body:JSON.stringify({...input,workspaceId:id(99)})})).status).toBe(400);
  }
 }
});

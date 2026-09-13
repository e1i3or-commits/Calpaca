import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import type { AuthEnv } from "../../src/auth/session";
import { createFranchiseOnboardingRoutes, type FranchiseOnboardingDeps } from "../../src/api/routes/franchise-onboarding";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const raw={sourceWorkspaceId:id(1),sourceProjectKey:"new-location",locationKey:id(2),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Sample Entity",locationName:"Sample City",franchiseSuccessUserIds:[id(3),id(4),id(5),id(6)],kaiUserId:id(7),andrewUserId:id(8),accountLeadUserId:id(3),organizerUserId:id(3)};
function deps(role:"admin"|"member"|null):FranchiseOnboardingDeps {
 const requireAuth:MiddlewareHandler<AuthEnv>=async(c,next)=>{if(!role)return c.json({error:"unauthorized"},401);c.set("user",{id:id(7),name:"Kai",email:"kai@example.test",workspaceId:id(99),workspaceRole:role});await next();};
 return {requireAuth,provision:async()=>({kind:"source_conflict"}),get:async()=>({kind:"not_found"}),updateCadence:async()=>({kind:"revision_conflict"}),prepareKickoff:async()=>({kind:"not_found"}),prepareCheckin:async()=>({kind:"not_found"})};
}
const request=(app:ReturnType<typeof createFranchiseOnboardingRoutes>,body:unknown=raw)=>app.request('/api/automation/franchise-onboarding',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
describe("franchise onboarding API",()=>{
 test("kickoff preparation is admin-only, workspace-scoped, no-store and cannot accept a publication override",async()=>{
  const path=`/api/automation/franchise-onboarding/${id(50)}/kickoff`;
  for(const [role,status] of [[null,401],["member",403]] as const){let called=false;const d=deps(role);d.prepareKickoff=async()=>{called=true;return {kind:"not_found"};};const response=await createFranchiseOnboardingRoutes(d).request(path,{method:"POST"});expect(response.status).toBe(status);expect(called).toBe(false);expect(response.headers.get("cache-control")).toBe("no-store");}
  let received:unknown;const d=deps("admin");d.prepareKickoff=async(workspaceId,actor,engagementId)=>{received={workspaceId,actor,engagementId};return {kind:"created",eventTypeId:id(60),kickoffBookingUrl:null,schedulingState:"not_published"};};
  const app=createFranchiseOnboardingRoutes(d);const response=await app.request(path,{method:"POST"});
  expect(response.status).toBe(201);expect(received).toMatchObject({workspaceId:id(99),engagementId:id(50)});expect(await response.json()).toMatchObject({kickoffBookingUrl:null,schedulingState:"not_published"});
  expect((await app.request(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({publishedAt:"now",organizerUserId:id(90)})})).status).toBe(400);
 });
 test("requires an authenticated administrator before accessing provisioning",async()=>{
  for(const [role,status] of [[null,401],["member",403]] as const){let called=false;const d=deps(role);d.provision=async()=>{called=true;return {kind:"source_conflict"};};const r=await request(createFranchiseOnboardingRoutes(d));expect(r.status).toBe(status);expect(called).toBe(false);expect(r.headers.get('cache-control')).toBe('no-store');}
 });
 test("uses the authenticated Calpaca workspace and defaults 45 minutes without allowing a workspace override",async()=>{
  let received:unknown;const d=deps('admin');d.provision=async(workspaceId,actor,input)=>{received={workspaceId,actor,input};return {kind:'source_conflict'};};const app=createFranchiseOnboardingRoutes(d);
  expect((await request(app)).status).toBe(409);
  expect(received).toMatchObject({workspaceId:id(99),input:{sourceWorkspaceId:id(1),kickoffDurationMinutes:45,followupDurationMinutes:45}});
  expect((await request(app,{...raw,workspaceId:id(1)})).status).toBe(400);
 });
 test("returns machine-readable source and revision conflicts for automation recovery",async()=>{
  const app=createFranchiseOnboardingRoutes(deps('admin'));
  expect(await (await request(app)).json()).toEqual({error:'source_conflict'});
  const r=await app.request(`/api/me/engagements/${id(3)}/onboarding-cadence`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({revision:1,cadence:'monthly'})});
  expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'revision_conflict'});
  expect((await app.request(`/api/automation/franchise-onboarding/${id(1)}/new-location`)).status).toBe(404);
 });
});

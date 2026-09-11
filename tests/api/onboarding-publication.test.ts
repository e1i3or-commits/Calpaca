import {expect,test} from "bun:test";
import type {MiddlewareHandler} from "hono";
import type {AuthEnv} from "../../src/auth/session";
import {createOnboardingPublicationRoutes,type OnboardingPublicationDeps} from "../../src/api/routes/onboarding-publication";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("publication and cadence activation authenticate, scope the workspace and reject unreviewed extra input",async()=>{
 let called:unknown;
 const auth:MiddlewareHandler<AuthEnv>=async(c,next)=>{const role=c.req.header("test-role");if(!role)return c.json({error:"unauthorized"},401);c.set("user",{id:id(1),name:"Synthetic",email:"synthetic@example.invalid",workspaceId:id(2),workspaceRole:role as "admin"|"member"});await next();};
 const deps:OnboardingPublicationDeps={requireAuth:auth,get:async()=>({kind:"not_found"}),publish:async(workspaceId,actor,engagementId,input)=>{called={workspaceId,actor,engagementId,input};return {kind:"blocked",issues:["rollout_not_enabled"]};},enable:async()=>({kind:"forbidden"})};
 const app=createOnboardingPublicationRoutes(deps),path=`/api/me/engagements/${id(3)}/onboarding-scheduling`;
 const post=(body:unknown,role?:string,action="publish-kickoff")=>app.request(`${path}/${action}?workspaceId=${id(99)}`,{method:"POST",headers:{"content-type":"application/json",...(role?{"test-role":role}:{})},body:JSON.stringify(body)});
 const input={revision:1,requestId:id(4)};
 expect((await post(input)).status).toBe(401);expect((await post(input,"member")).status).toBe(403);expect(called).toBeUndefined();
 expect((await post({...input,force:true},"admin")).status).toBe(400);
 expect((await post(input,"admin","enable-followups")).status).toBe(400);
 const response=await post(input,"admin");expect(response.status).toBe(409);expect(response.headers.get("cache-control")).toBe("no-store");
 expect(called).toMatchObject({workspaceId:id(2),engagementId:id(3),input});
 expect((await app.request(path)).status).toBe(401);
});

import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { oneOffMeetingInput } from "../../core/engagement/one-off-meeting";
import { createOneOffMeeting, listOneOffMeetings } from "../../db/one-off-meeting-repo";
export function createOneOffMeetingRoutes(deps:{requireAuth:MiddlewareHandler<AuthEnv>;create:typeof createOneOffMeeting;list:typeof listOneOffMeetings}={requireAuth:requireSession,create:createOneOffMeeting,list:listOneOffMeetings}) {
  const router=new Hono<AuthEnv>(),path="/api/me/engagements/:id/one-off-meetings";
  router.use(path,async(c,next)=>{c.header("Cache-Control","no-store");await next();},deps.requireAuth);
  router.get("/api/me/engagements/:id/one-off-meetings",async c=>{
    const user=c.get("user"),id=c.req.param("id");
    if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    if(!z.string().uuid().safeParse(id).success)return c.json({error:"invalid_input"},400);
    const result=await deps.list(user.workspaceId,{userId:user.id,workspaceRole:user.workspaceRole},id);
    return result.kind==="found"?c.json(result):c.json({error:result.kind},404);
  });
  router.post("/api/me/engagements/:id/one-off-meetings",async c=>{
    const user=c.get("user"),id=c.req.param("id");
    if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    const parsed=oneOffMeetingInput.safeParse(await c.req.json().catch(()=>null));
    if(!z.string().uuid().safeParse(id).success||!parsed.success)return c.json({error:"invalid_input"},400);
    const result=await deps.create(user.workspaceId,{userId:user.id,workspaceRole:user.workspaceRole},id,parsed.data);
    if(result.kind==="created"||result.kind==="reused")return c.json(result,result.kind==="created"?201:200);
    return c.json({error:result.kind},result.kind==="not_found"?404:409);
  });
  return router;
}
export const oneOffMeetingRoutes=createOneOffMeetingRoutes();

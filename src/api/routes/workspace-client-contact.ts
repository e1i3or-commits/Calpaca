import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { workspaceClientContactSync } from "../../core/engagement/franchise-onboarding";
import { syncWorkspaceClientContact } from "../../db/onboarding-contact-repo";
export function createWorkspaceClientContactRoutes(deps:{requireAuth:MiddlewareHandler<AuthEnv>;sync:typeof syncWorkspaceClientContact}={requireAuth:requireSession,sync:syncWorkspaceClientContact}) {
  const router=new Hono<AuthEnv>();
  router.use("/api/automation/franchise-onboarding/:engagementId/workspace-contact",async(c,next)=>{c.header("Cache-Control","no-store");await next();},deps.requireAuth);
  router.put("/api/automation/franchise-onboarding/:engagementId/workspace-contact",async c=>{
    const user=c.get("user");if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    if(!["owner","admin"].includes(user.workspaceRole))return c.json({error:"forbidden"},403);
    const id=c.req.param("engagementId"),parsed=workspaceClientContactSync.safeParse(await c.req.json().catch(()=>null));
    if(!z.string().uuid().safeParse(id).success||!parsed.success)return c.json({error:"invalid_input"},400);
    const result=await deps.sync(user.workspaceId,{userId:user.id,workspaceRole:user.workspaceRole},id,parsed.data);
    if(["applied","reused","unchanged","manual_override"].includes(result.kind))return c.json(result);
    return c.json({error:result.kind},result.kind==="forbidden"?403:result.kind==="not_found"?404:409);
  });
  return router;
}
export const workspaceClientContactRoutes=createWorkspaceClientContactRoutes();

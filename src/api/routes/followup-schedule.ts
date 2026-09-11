import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { followupApplyInput, followupPreviewInput } from "../../core/engagement/followup-schedule";
import { applyFollowupSchedule, getFollowupSchedule, previewFollowupSchedule } from "../../db/followup-schedule-repo";
export interface FollowupScheduleDeps {
  requireAuth: MiddlewareHandler<AuthEnv>;
  get: typeof getFollowupSchedule; preview: typeof previewFollowupSchedule; apply: typeof applyFollowupSchedule;
}
const defaults:FollowupScheduleDeps={requireAuth:requireSession,get:getFollowupSchedule,preview:previewFollowupSchedule,apply:applyFollowupSchedule};
export function createFollowupScheduleRoutes(deps:FollowupScheduleDeps=defaults) {
  const router=new Hono<AuthEnv>(), path="/api/me/engagements/:id/followup-schedule";
  for(const route of [path,`${path}/*`])router.use(route,async(c,next)=>{c.header("Cache-Control","no-store");await next();},deps.requireAuth);
  const handle=(action:"get"|"preview"|"apply")=>async(c:Context<AuthEnv>)=>{
      const user=c.get("user");if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
      const id=c.req.param("id");if(!id||!z.string().uuid().safeParse(id).success)return c.json({error:"invalid_input"},400);
      const actor={userId:user.id,workspaceRole:user.workspaceRole};
      if(action==="get") {
        const result=await deps.get(user.workspaceId,actor,id);
        return result.kind==="found"?c.json(result):c.json({error:result.kind},404);
      }
      const body=await c.req.json().catch(()=>null);
      const preview=followupPreviewInput.safeParse(body), apply=followupApplyInput.safeParse(body);
      if(action==="preview"?!preview.success:!apply.success)return c.json({error:"invalid_input"},400);
      const result=action==="preview"?await deps.preview(user.workspaceId,actor,id,preview.data!):await deps.apply(user.workspaceId,actor,id,apply.data!);
      if(["previewed","applied","reused"].includes(result.kind))return c.json(result);
      return c.json({error:result.kind,...("issues" in result?{issues:result.issues}:{})},result.kind==="not_found"?404:result.kind==="forbidden"?403:result.kind==="invalid_input"?400:409);
  };
  router.get("/api/me/engagements/:id/followup-schedule",handle("get"));
  router.post("/api/me/engagements/:id/followup-schedule/preview",handle("preview"));
  router.post("/api/me/engagements/:id/followup-schedule/apply",handle("apply"));
  return router;
}
export const followupScheduleRoutes=createFollowupScheduleRoutes();

import {Hono,type MiddlewareHandler,type Handler} from "hono";
import {z} from "zod";
import {requireSession,type AuthEnv} from "../../auth/session";
import {publishOnboardingInput,enableFollowupsInput} from "../../core/engagement/onboarding-publication";
import {getOnboardingScheduling,publishOnboardingKickoff,enableOnboardingFollowups} from "../../db/onboarding-publication-repo";
export interface OnboardingPublicationDeps {requireAuth:MiddlewareHandler<AuthEnv>;get:typeof getOnboardingScheduling;publish:typeof publishOnboardingKickoff;enable:typeof enableOnboardingFollowups;}
const defaults:OnboardingPublicationDeps={requireAuth:requireSession,get:getOnboardingScheduling,publish:publishOnboardingKickoff,enable:enableOnboardingFollowups};
export function createOnboardingPublicationRoutes(deps:OnboardingPublicationDeps=defaults) {
  const router=new Hono<AuthEnv>();
  for(const path of ["/api/me/engagements/:id/onboarding-scheduling","/api/me/engagements/:id/onboarding-scheduling/*"])router.use(path,async(c,next)=>{c.header("Cache-Control","no-store");await next();},deps.requireAuth);
  router.get("/api/me/engagements/:id/onboarding-scheduling",async c=>{
    const user=c.get("user");if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    if(!z.string().uuid().safeParse(c.req.param("id")).success)return c.json({error:"invalid_id"},400);
    const result=await deps.get(user.workspaceId,{userId:user.id,workspaceRole:user.workspaceRole},c.req.param("id"));
    return result.kind==="found"?c.json(result):c.json({error:result.kind},404);
  });
  const mutate=(action:"publish-kickoff"|"enable-followups"):Handler<AuthEnv>=>async c=>{
    const user=c.get("user");if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    if(action==="publish-kickoff" && !["admin","owner"].includes(user.workspaceRole))return c.json({error:"forbidden"},403);
    if(!z.string().uuid().safeParse(c.req.param("id")).success)return c.json({error:"invalid_id"},400);
    const body=await c.req.json().catch(()=>null);
    const parsed=action==="publish-kickoff"?publishOnboardingInput.safeParse(body):enableFollowupsInput.safeParse(body);
    if(!parsed.success)return c.json({error:"invalid_input"},400);
    const actor={userId:user.id,workspaceRole:user.workspaceRole};
    const result=action==="publish-kickoff"?await deps.publish(user.workspaceId,actor,c.req.param("id")!,publishOnboardingInput.parse(body)):
      await deps.enable(user.workspaceId,actor,c.req.param("id")!,enableFollowupsInput.parse(body));
    if(result.kind==="applied"||result.kind==="reused"||result.kind==="already_enabled")return c.json(result);
    return c.json({error:result.kind,...(result.kind==="blocked"?{issues:result.issues}:{})},result.kind==="not_found"?404:result.kind==="forbidden"?403:409);
  };
  router.post("/api/me/engagements/:id/onboarding-scheduling/publish-kickoff",mutate("publish-kickoff"));
  router.post("/api/me/engagements/:id/onboarding-scheduling/enable-followups",mutate("enable-followups"));
  return router;
}
export const onboardingPublicationRoutes=createOnboardingPublicationRoutes();

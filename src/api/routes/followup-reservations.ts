import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { getFollowupReservations, prepareOnboardingFollowups, reserveOnboardingFollowup } from "../../db/followup-reservation-repo";
export const reserveFollowupInput=z.object({revision:z.number().int().positive()}).strict();
export const prepareFollowupInput=z.object({}).strict();
export interface FollowupReservationDeps {
  requireAuth:MiddlewareHandler<AuthEnv>;
  get:typeof getFollowupReservations; prepare:typeof prepareOnboardingFollowups; reserve:typeof reserveOnboardingFollowup;
}
const defaults:FollowupReservationDeps={requireAuth:requireSession,get:getFollowupReservations,prepare:prepareOnboardingFollowups,reserve:reserveOnboardingFollowup};
export function createFollowupReservationRoutes(deps:FollowupReservationDeps=defaults) {
  const router=new Hono<AuthEnv>();
  router.use("/api/automation/followup-reservations/*",async(c,next)=>{c.header("Cache-Control","no-store");await next();},deps.requireAuth);
  const handle=(action:"get"|"prepare"|"reserve")=>async(c:Context<AuthEnv>)=>{
    const user=c.get("user");if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    if(!["admin","owner"].includes(user.workspaceRole))return c.json({error:"forbidden"},403);
    const id=c.req.param("engagementId"),occurrenceId=c.req.param("occurrenceId");
    if(!z.string().uuid().safeParse(id).success || (action==="reserve"&&!z.string().uuid().safeParse(occurrenceId).success))return c.json({error:"invalid_input"},400);
    const actor={userId:user.id,workspaceRole:user.workspaceRole};
    if(action==="get") {
      const result=await deps.get(user.workspaceId,actor,id!);
      return result.kind==="found"?c.json(result):c.json({error:result.kind},result.kind==="forbidden"?403:404);
    }
    const body=await c.req.text();let json:unknown={};try{if(body)json=JSON.parse(body);}catch{return c.json({error:"invalid_input"},400);}
    const parsed=action==="reserve"?reserveFollowupInput.safeParse(json):prepareFollowupInput.safeParse(json);
    if(!parsed.success)return c.json({error:"invalid_input"},400);
    const result=action==="prepare"?await deps.prepare(user.workspaceId,actor,id!):await deps.reserve(user.workspaceId,actor,id!,occurrenceId!,reserveFollowupInput.parse(json).revision);
    if(result.kind==="created"||result.kind==="reserved"||result.kind==="reused")return c.json(result,result.kind==="reused"?200:201);
    return c.json({...result,error:result.kind},result.kind==="forbidden"?403:result.kind==="not_found"?404:409);
  };
  router.get("/api/automation/followup-reservations/:engagementId",handle("get"));
  router.post("/api/automation/followup-reservations/:engagementId",handle("prepare"));
  router.post("/api/automation/followup-reservations/:engagementId/:occurrenceId/reserve",handle("reserve"));
  return router;
}
export const followupReservationRoutes=createFollowupReservationRoutes();

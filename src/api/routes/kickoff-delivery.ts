import { Hono,type MiddlewareHandler } from "hono";
import { z } from "zod";
import { timingSafeEqual,createHash } from "node:crypto";
import { requireSession,type AuthEnv } from "../../auth/session";
import { kickoffReceiptInput } from "../../core/invite/kickoff-delivery";
import { kickoffDeliveryReport,recordKickoffReceipt,retryKickoffDelivery } from "../../db/kickoff-delivery-repo";

export interface KickoffDeliveryApiDeps {
  requireAuth:MiddlewareHandler<AuthEnv>;
  secret:()=>string|undefined;
  report:typeof kickoffDeliveryReport;
  receipt:typeof recordKickoffReceipt;
  retry:typeof retryKickoffDelivery;
}
const defaults:KickoffDeliveryApiDeps={requireAuth:requireSession,secret:()=>process.env.KICKOFF_DELIVERY_WEBHOOK_SECRET,report:kickoffDeliveryReport,receipt:recordKickoffReceipt,retry:retryKickoffDelivery};
export function createKickoffDeliveryRoutes(deps:KickoffDeliveryApiDeps=defaults) {
  const router=new Hono<AuthEnv>();
  for(const path of ["/api/automation/kickoff-deliveries","/api/automation/kickoff-deliveries/*"])router.use(path,async(c,next)=>{c.header("Cache-Control","no-store");await next();},deps.requireAuth);
  router.get("/api/automation/kickoff-deliveries",async c=>{
    const user=c.get("user");if(!user.workspaceId)return c.json({error:"workspace_not_found"},404);
    if(!["admin","owner"].includes(user.workspaceRole??""))return c.json({error:"forbidden"},403);
    return c.json(await deps.report(user.workspaceId));
  });
  router.post("/api/automation/kickoff-deliveries/:id/retry",async c=>{
    const user=c.get("user");if(!user.workspaceId)return c.json({error:"workspace_not_found"},404);
    if(!["admin","owner"].includes(user.workspaceRole??""))return c.json({error:"forbidden"},403);
    if(!z.string().uuid().safeParse(c.req.param("id")).success)return c.json({error:"invalid_id"},400);
    const result=await deps.retry(user.workspaceId,c.req.param("id"),user.id);
    return result.kind==="queued"?c.json(result):c.json({error:result.kind},result.kind==="not_found"?404:409);
  });
  router.post("/api/webhooks/kickoff-delivery",async c=>{
    c.header("Cache-Control","no-store");const secret=deps.secret();if(!secret)return c.json({error:"not_found"},404);
    const authorization=c.req.header("authorization")??"";
    const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
    const digest=(value:string)=>createHash("sha256").update(value).digest();
    if(!token||!timingSafeEqual(digest(token),digest(secret)))return c.json({error:"unauthorized"},401);
    const parsed=kickoffReceiptInput.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:"invalid_receipt"},400);
    const result=await deps.receipt(parsed.data);
    if(result.kind==="recorded"||result.kind==="duplicate")return c.json(result);
    return c.json({error:result.kind},result.kind==="not_found"?404:409);
  });
  return router;
}
export const kickoffDeliveryRoutes=createKickoffDeliveryRoutes();

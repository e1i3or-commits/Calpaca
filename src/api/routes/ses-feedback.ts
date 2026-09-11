import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createHash,timingSafeEqual } from "node:crypto";
import { configuredSesBinding,sesNotificationInput } from "../../core/invite/ses-feedback";
import { recordSesNotification } from "../../db/ses-feedback-repo";
export interface SesFeedbackDeps {
  secret:()=>string|undefined;
  binding:typeof configuredSesBinding;
  record:typeof recordSesNotification;
}
const defaults:SesFeedbackDeps={secret:()=>process.env.ONBOARDING_SES_WEBHOOK_SECRET,binding:configuredSesBinding,record:recordSesNotification};
export function createSesFeedbackRoutes(deps:SesFeedbackDeps=defaults) {
  const router=new Hono();
  router.use("/api/webhooks/ses-onboarding",async(c,next)=>{
    c.header("Cache-Control","no-store");
    const secret=deps.secret();if(!secret)return c.json({error:"not_found"},404);
    const authorization=c.req.header("authorization")??"";
    const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
    const digest=(value:string)=>createHash("sha256").update(value).digest();
    if(!token || !timingSafeEqual(digest(token),digest(secret)))return c.json({error:"unauthorized"},401);
    await next();
  },bodyLimit({maxSize:256_000}));
  router.post("/api/webhooks/ses-onboarding",async c=>{
    const binding=deps.binding();if(!binding)return c.json({error:"feedback_configuration_missing"},503);
    const parsed=sesNotificationInput.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return c.json({error:"invalid_notification"},400);
    const result=await deps.record(parsed.data,binding);
    if(result.kind==="recorded" || result.kind==="duplicate")return c.json(result);
    return c.json({error:result.kind},result.kind==="not_found"?404:result.kind==="invalid_event"?400:409);
  });
  return router;
}
export const sesFeedbackRoutes=createSesFeedbackRoutes();

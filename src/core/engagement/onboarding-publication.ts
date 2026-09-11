import { z } from "zod";
import { configuredSesBinding,sesPollInput } from "../invite/ses-feedback";
export const publishOnboardingInput=z.object({revision:z.number().int().positive(),requestId:z.string().uuid()}).strict();
export const enableFollowupsInput=publishOnboardingInput.extend({kickoffBookingId:z.string().uuid(),previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type SchedulingRuntime={publicOrigin:string|null;issues:string[]};
export function schedulingRuntime():SchedulingRuntime {
  const issues:string[]=[];let publicOrigin:string|null=null;
  if(process.env.ONBOARDING_SCHEDULING_ENABLED!=="true")issues.push("rollout_not_enabled");
  if(!process.env.SMTP_URL || !process.env.EMAIL_FROM)issues.push("mail_configuration_missing");
  if(!process.env.ONBOARDING_SES_WEBHOOK_SECRET || !configuredSesBinding() || !sesPollInput.shape.queueUrl.safeParse(process.env.ONBOARDING_SES_QUEUE_URL).success)issues.push("delivery_feedback_not_configured");
  try {const url=new URL(process.env.PUBLIC_URL??"");if(url.protocol!=="https:" || url.username || url.password || url.search || url.hash || !["","/"].includes(url.pathname))throw new Error("invalid_origin");publicOrigin=url.origin;}
  catch {issues.push("public_url_not_configured");}
  return {publicOrigin,issues};
}

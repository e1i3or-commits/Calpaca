import { createHash } from "node:crypto";
import { z } from "zod";

const email = z.string().email().max(320).transform(value => value.toLowerCase());
const addresses = z.array(email).min(1).max(50);
export const sesNotificationInput = z.object({
  Type: z.literal("Notification"), TopicArn: z.string().min(1).max(300),
  MessageId: z.string().uuid(), Message: z.string().min(1).max(200_000),
});
export type SesNotification = z.infer<typeof sesNotificationInput>;
const mailInput = z.object({
  sendingAccountId: z.string().regex(/^\d{12}$/), messageId: z.string().min(1).max(200),
  destination: addresses, tags: z.record(z.array(z.string().max(256)).min(1).max(50)),
});
const eventInput = z.discriminatedUnion("eventType", [
  z.object({eventType:z.literal("Delivery"), mail:mailInput, delivery:z.object({recipients:addresses})}),
  z.object({eventType:z.literal("Bounce"), mail:mailInput, bounce:z.object({bouncedRecipients:z.array(z.object({emailAddress:email})).min(1).max(50)})}),
  z.object({eventType:z.literal("Complaint"), mail:mailInput, complaint:z.object({complainedRecipients:z.array(z.object({emailAddress:email})).min(1).max(50)})}),
  z.object({eventType:z.literal("Reject"), mail:mailInput, reject:z.object({reason:z.string().min(1)})}),
  z.object({eventType:z.literal("Rendering Failure"), mail:mailInput, failure:z.object({errorMessage:z.string().min(1)})}),
]);
export const sesBindingInput = z.object({
  topicArn:z.string().regex(/^arn:aws:sns:[a-z0-9-]+:\d{12}:[a-zA-Z0-9_-]+$/),
  sendingAccountId:z.string().regex(/^\d{12}$/),
  configurationSet:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
});
export type SesBinding = z.infer<typeof sesBindingInput>;
export function configuredSesBinding(): SesBinding | null {
  const result=sesBindingInput.safeParse({topicArn:process.env.ONBOARDING_SES_TOPIC_ARN,
    sendingAccountId:process.env.ONBOARDING_SES_ACCOUNT_ID,configurationSet:process.env.ONBOARDING_SES_CONFIGURATION_SET});
  return result.success?result.data:null;
}
export const sesMessageKey = (messageId:string) => createHash("sha256").update(messageId).digest("hex");
export function sesInviteHeaders(deliveryId:string,messageId:string,configurationSet:string) {
  z.string().uuid().parse(deliveryId);
  sesBindingInput.shape.configurationSet.parse(configurationSet);
  return {"X-SES-CONFIGURATION-SET":configurationSet,
    "X-SES-MESSAGE-TAGS":`calpaca_delivery_id=${deliveryId},calpaca_message_key=${sesMessageKey(messageId)}`};
}
const singleTag = (tags:Record<string,string[]>,key:string) => tags[key]?.length===1?tags[key]![0]:undefined;
export function normalizeSesNotification(input:SesNotification,binding:SesBinding) {
  if(input.TopicArn!==binding.topicArn)return {kind:"source_mismatch" as const};
  let payload:unknown;try {payload=JSON.parse(input.Message);}catch{return {kind:"invalid_event" as const};}
  const parsed=eventInput.safeParse(payload);if(!parsed.success)return {kind:"invalid_event" as const};
  const event=parsed.data,mail=event.mail;
  if(mail.sendingAccountId!==binding.sendingAccountId || singleTag(mail.tags,"ses:configuration-set")!==binding.configurationSet)return {kind:"source_mismatch" as const};
  const deliveryId=singleTag(mail.tags,"calpaca_delivery_id"),messageKey=singleTag(mail.tags,"calpaca_message_key");
  if(!z.string().uuid().safeParse(deliveryId).success || !messageKey || !/^[a-f0-9]{64}$/.test(messageKey))return {kind:"correlation_missing" as const};
  const recipients=event.eventType==="Delivery"?event.delivery.recipients:event.eventType==="Bounce"?event.bounce.bouncedRecipients.map(p=>p.emailAddress):event.eventType==="Complaint"?event.complaint.complainedRecipients.map(p=>p.emailAddress):mail.destination;
  const destination=[...new Set(mail.destination)].sort();
  if(new Set(recipients).size!==recipients.length || recipients.some(recipient=>!destination.includes(recipient)))return {kind:"recipient_mismatch" as const};
  const status=event.eventType==="Delivery"?"delivered" as const:event.eventType==="Bounce"?"bounced" as const:event.eventType==="Complaint"?"complained" as const:event.eventType==="Reject"?"rejected" as const:"rendering_failed" as const;
  const notificationId=sesMessageKey(`${input.TopicArn}\n${input.MessageId}`);
  const notification={deliveryId:deliveryId!,messageKey,providerMessageId:mail.messageId,destination,recipients:[...recipients].sort(),status};
  return {kind:"normalized" as const,notificationId,payloadHash:sesMessageKey(JSON.stringify(notification)),...notification};
}

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { normalizeSesNotification,sesMessageKey,type SesBinding,type SesNotification,type SesPoll } from "../core/invite/ses-feedback";
import { getDb } from "./client";
import { recordKickoffReceipt } from "./kickoff-delivery-repo";
import * as s from "./schema";

class FeedbackRejected extends Error {
  constructor(readonly kind:"not_found"|"receipt_mismatch"|"receipt_conflict") {super(kind);}
}
/** Only called by the authenticated adapter reading the restricted SNS/SQS queue.
 * The SNS notification and every recipient projection commit together. */
export async function recordSesNotification(input:SesNotification,binding:SesBinding,db:NodePgDatabase<typeof s>=getDb()) {
  const event=normalizeSesNotification(input,binding);if(event.kind!=="normalized")return event;
  try {
    return await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${event.notificationId}, 19))`);
      const [prior]=await tx.select().from(s.sesFeedbackNotifications).where(eq(s.sesFeedbackNotifications.id,event.notificationId));
      if(prior)return {kind:prior.payloadHash===event.payloadHash?"duplicate" as const:"receipt_conflict" as const};
      const [delivery]=await tx.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.id,event.deliveryId));
      if(!delivery)return {kind:"not_found" as const};
      if(event.messageKey!==sesMessageKey(delivery.messageId) || JSON.stringify(event.destination)!==JSON.stringify(delivery.recipients.map(p=>p.email).sort()))return {kind:"receipt_mismatch" as const};
      for(const recipient of event.recipients) {
        const result=await recordKickoffReceipt({deliveryId:delivery.id,messageId:delivery.messageId,
          providerMessageId:event.providerMessageId,providerEventId:`ses:${event.notificationId}:${sesMessageKey(recipient)}`,
          recipient,status:event.status},tx);
        if(result.kind!=="recorded" && result.kind!=="duplicate")throw new FeedbackRejected(result.kind);
      }
      await tx.insert(s.sesFeedbackNotifications).values({id:event.notificationId,deliveryId:delivery.id,payloadHash:event.payloadHash});
      return {kind:"recorded" as const};
    });
  }catch(error) {if(error instanceof FeedbackRejected)return {kind:error.kind};throw error;}
}

export async function recordSesPoll(input:SesPoll,binding:SesBinding,queueUrl:string,db:NodePgDatabase<typeof s>=getDb()) {
  if(input.queueUrl!==queueUrl)return {kind:"queue_mismatch" as const};
  return db.transaction(async tx=>{
    if(input.notificationId) {
      const id=sesMessageKey(`${binding.topicArn}\n${input.notificationId}`);
      const [notification]=await tx.select({id:s.sesFeedbackNotifications.id}).from(s.sesFeedbackNotifications).where(eq(s.sesFeedbackNotifications.id,id));
      if(!notification)return {kind:"notification_unrecorded" as const};
    }
    const checkedAt=new Date();
    await tx.insert(s.kickoffDeliveryWorker).values({name:"ses-feedback",lastSweepAt:checkedAt})
      .onConflictDoUpdate({target:s.kickoffDeliveryWorker.name,set:{lastSweepAt:checkedAt}});
    return {kind:"recorded" as const,checkedAt:checkedAt.toISOString()};
  });
}

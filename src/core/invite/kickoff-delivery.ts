import { z } from "zod";

export type KickoffDeliveryStatus = "queued" | "processing" | "awaiting_delivery" | "delivered" | "needs_attention" | "superseded";
export type KickoffRecipient = { email: string; status: "pending" | "accepted" | "delivered" | "failed" };
export const kickoffReceiptInput = z.object({
  deliveryId: z.string().uuid(), messageId: z.string().min(1).max(200),
  providerEventId: z.string().min(1).max(200), recipient: z.string().email().max(320).transform(value => value.toLowerCase()),
  status: z.enum(["delivered", "bounced", "complained", "rejected", "rendering_failed"]),
  providerMessageId: z.string().min(1).max(200).optional(),
}).strict();
export type KickoffReceipt = z.infer<typeof kickoffReceiptInput>;

/** Negative evidence cannot be erased by a duplicate or delayed delivery event. */
export function receiptRecipients(recipients: KickoffRecipient[], receipt: KickoffReceipt): KickoffRecipient[] {
  return recipients.map(person => person.email !== receipt.recipient ? person : {...person,
    status: person.status === "failed" || receipt.status !== "delivered" ? "failed" : "delivered"});
}

export function recipientOutcome(recipients: KickoffRecipient[]) {
  if(recipients.some(person => person.status === "failed"))return "failed";
  if(recipients.length && recipients.every(person => person.status === "delivered"))return "delivered";
  return "pending";
}

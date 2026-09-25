import { followupAutomationHealth } from "./followup-automation-state";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, notExists, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Temporal } from "@js-temporal/polyfill";
import { receiptRecipients, recipientOutcome, type KickoffReceipt } from "../core/invite/kickoff-delivery";
import { appendEvent, getInviteContext, type InviteContext } from "./booking-repo";
import { kickoffHosts, loadKickoffContext } from "./kickoff-context";
import { getDb } from "./client";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;
export type Delivery = typeof s.kickoffDeliveries.$inferSelect;
/** Why an update was queued when it is not a time change: the email then
 * reads as a first invitation for the new invitee instead of "Rescheduled". */
export type DeliveryReason = "invitee_changed";
export type StoredInviteContext = Omit<InviteContext,"booking"> & {booking:Omit<InviteContext["booking"],"startsAt"|"endsAt"> & {startsAt:string;endsAt:string};deliveryReason?:DeliveryReason};
export function restoreInviteContext(snapshot:StoredInviteContext):InviteContext {
  return {...snapshot,booking:{...snapshot.booking,startsAt:Temporal.Instant.from(snapshot.booking.startsAt),endsAt:Temporal.Instant.from(snapshot.booking.endsAt)}};
}
const audit = (db:Db,deliveryId:string,kind:string,code?:string,attemptId?:string|null) => db.insert(s.kickoffDeliveryEvents).values({deliveryId,kind,code,attemptId});

// Match booking mutations' host -> booking -> delivery lock order. Feedback
// and calendar verification can otherwise deadlock with a reschedule.
async function lockDeliveryBooking(db:Db,bookingId:string) {
  const [booking]=await db.select({eventTypeId:s.bookings.eventTypeId}).from(s.bookings).where(eq(s.bookings.id,bookingId));
  const kickoff=booking?await loadKickoffContext(booking.eventTypeId,db):null;
  if(kickoff)for(const hostId of [...kickoffHosts(kickoff)].sort())await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${hostId}, 0))`);
  await db.select({id:s.bookings.id}).from(s.bookings).where(eq(s.bookings.id,bookingId)).for("update");
}
async function lockDeliveryContext(db:Db,id:string) {
  const [row]=await db.select({bookingId:s.kickoffDeliveries.bookingId}).from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.id,id));
  if(row)await lockDeliveryBooking(db,row.bookingId);
}

async function projectDelivery(row:Delivery,db:Db) {
  if(!row.calendarVerifiedAt||!row.mailAcceptedAt||row.kind==="cancelled")return;
  const [latest]=await db.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.bookingId,row.bookingId),inArray(s.kickoffDeliveries.kind,["created","rescheduled","cancelled"]))).orderBy(desc(s.kickoffDeliveries.sequence)).limit(1);
  if(latest?.sourceEventId!==row.sourceEventId||latest.kind==="cancelled")return;
  const markers=await db.select({kind:s.kickoffDeliveryEvents.kind}).from(s.kickoffDeliveryEvents).where(eq(s.kickoffDeliveryEvents.deliveryId,row.id));
  for(const [marker,kind] of [["handoff_projected",row.kind==="reminder"?"reminder_sent":"invite_sent"],
    ...(row.status==="delivered"&&row.kind!=="reminder"?[["delivery_projected","invite_delivered"] as const]:[]),
    ...(row.recipients.some(person=>person.status==="failed")&&row.kind!=="reminder"?[["failure_projected","invite_failed"] as const]:[])] as const) {
    if(markers.some(item=>item.kind===marker))continue;
    const result=await appendEvent(row.bookingId,kind,{},db,row.id);
    if(!result.ok) {
      if(result.error.reason==="kickoff_delivery_superseded")return;
      throw new Error("kickoff_delivery_projection_failed");
    }
    await audit(db,row.id,marker);
  }
}

/** Called in the booking-event transaction. A queue outage cannot lose intent. */
export async function queueKickoffDelivery(bookingId:string,sourceEventId:string,kind:Delivery["kind"],db:Db,reason?:DeliveryReason) {
  const [booking]=await db.select({eventTypeId:s.bookings.eventTypeId}).from(s.bookings).where(eq(s.bookings.id,bookingId));
  if(!booking)return;
  const kickoff=await loadKickoffContext(booking.eventTypeId,db);if(!kickoff)return;
  const ctx=await getInviteContext(bookingId,db);if(!ctx)throw new Error("kickoff_invite_context_missing");
  const id=crypto.randomUUID();
  // A contact change concerns only the new invitee; the team's meetings did
  // not move, so they get no email for it.
  const recipients=reason==="invitee_changed"?[ctx.booking.inviteeEmail.toLowerCase()]
    :[...new Set([ctx.booking.inviteeEmail,...ctx.hosts.map(host=>host.email),...(ctx.booking.guestEmails??[])].map(email=>email.toLowerCase()))];
  const [row]=await db.insert(s.kickoffDeliveries).values({id,workspaceId:kickoff.onboarding.workspaceId,onboardingId:kickoff.onboarding.id,
    bookingId,sourceEventId,kind,snapshot:{...JSON.parse(JSON.stringify(ctx)) as StoredInviteContext,...(reason?{deliveryReason:reason}:{})},
    recipients:recipients.map(email=>({email,status:"pending" as const})),ownerUserId:kickoff.engagement.accountLeadUserId,
    messageId:`<${id}.${bookingId}@scheduling-platform>`,googleEventId:ctx.booking.googleEventId??`c${bookingId.replaceAll("-","")}`,
    deadlineAt:new Date(Date.now()+15*60_000)}).onConflictDoNothing().returning();
  if(row) {
    await audit(db,row.id,"queued");
    if(kind!=="reminder") {
      const obsolete=await db.update(s.kickoffDeliveries).set({status:"superseded",issueCode:"superseded_before_dispatch",updatedAt:new Date()})
        .where(and(eq(s.kickoffDeliveries.bookingId,bookingId),lt(s.kickoffDeliveries.sequence,row.sequence),eq(s.kickoffDeliveries.status,"queued"),eq(s.kickoffDeliveries.attemptCount,0))).returning({id:s.kickoffDeliveries.id});
      for(const old of obsolete)await audit(db,old.id,"superseded");
    }
  }
}

export async function queueKickoffReminder(bookingId:string,db:Db=getDb()) {
  return db.transaction(async tx=>{
    await lockDeliveryBooking(tx,bookingId);
    const [booking]=await tx.select().from(s.bookings).where(eq(s.bookings.id,bookingId)).for("update");
    if(!booking||booking.status!=="confirmed"||booking.startsAt.getTime()<=Date.now()||booking.startsAt.getTime()>Date.now()+86400_000)return;
    const [source]=await tx.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.bookingId,bookingId),inArray(s.kickoffDeliveries.kind,["created","rescheduled"]))).orderBy(desc(s.kickoffDeliveries.sequence)).limit(1);
    if(source)await queueKickoffDelivery(bookingId,source.sourceEventId,"reminder",tx);
  });
}

export async function isKickoffDeliveryBooking(bookingId:string,db:Db=getDb()) {
  const [row]=await db.select({eventTypeId:s.bookings.eventTypeId}).from(s.bookings).where(eq(s.bookings.id,bookingId));
  return !!row && !!await loadKickoffContext(row.eventTypeId,db);
}

export async function supersedeKickoffDelivery(id:string,attemptId:string,db:Db=getDb()) {
  await db.transaction(async tx=>{
    const row=await lockedAttempt(tx,id,attemptId);if(row.mailStartedAt)throw new Error("kickoff_email_already_started");
    await tx.update(s.kickoffDeliveries).set({status:"superseded",issueCode:"reminder_no_longer_due",leaseUntil:null,updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,id));
    await audit(tx,id,"superseded","reminder_no_longer_due",attemptId);
  });
}

export async function sweepKickoffDeliveries(db:Db=getDb(),now=new Date()) {
  await db.transaction(async tx=>{
    const expired=await tx.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.status,"processing"),lt(s.kickoffDeliveries.leaseUntil,now))).for("update");
    for(const row of expired) {
      const emailStarted=row.mailStartedAt!==null;
      await tx.update(s.kickoffDeliveries).set({status:emailStarted?"needs_attention":"queued",issueCode:emailStarted?"email_outcome_unknown":"calendar_recovery_required",leaseUntil:null,updatedAt:now}).where(eq(s.kickoffDeliveries.id,row.id));
      await audit(tx,row.id,"lease_expired",emailStarted?"email_outcome_unknown":"calendar_recovery_required",row.attemptId);
    }
    const overdue=await tx.select().from(s.kickoffDeliveries).where(and(inArray(s.kickoffDeliveries.status,["queued","awaiting_delivery"]),lt(s.kickoffDeliveries.deadlineAt,now))).for("update");
    for(const row of overdue) {
      const code=row.status==="awaiting_delivery"?"delivery_receipt_overdue":"dispatch_overdue";
      await tx.update(s.kickoffDeliveries).set({status:"needs_attention",issueCode:code,updatedAt:now}).where(eq(s.kickoffDeliveries.id,row.id));
      await audit(tx,row.id,"attention_required",code);
    }
    await tx.insert(s.kickoffDeliveryWorker).values({name:"dispatcher",lastSweepAt:now}).onConflictDoUpdate({target:s.kickoffDeliveryWorker.name,set:{lastSweepAt:now}});
  });
}

export async function claimKickoffDelivery(db:Db=getDb(),now=new Date()) {
  return db.transaction(async tx=>{
    const earlier=alias(s.kickoffDeliveries,"earlier_delivery");
    const [row]=await tx.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.status,"queued"),lte(s.kickoffDeliveries.nextAttemptAt,now),
      notExists(tx.select({id:earlier.id}).from(earlier).where(and(eq(earlier.bookingId,s.kickoffDeliveries.bookingId),lt(earlier.sequence,s.kickoffDeliveries.sequence),
        notInArray(earlier.status,["delivered","superseded","awaiting_delivery"]),isNull(earlier.mailAcceptedAt))))))
      .orderBy(asc(s.kickoffDeliveries.sequence)).limit(1).for("update",{skipLocked:true});
    if(!row)return null;
    const attemptId=crypto.randomUUID();
    const [claimed]=await tx.update(s.kickoffDeliveries).set({status:"processing",attemptId,attemptCount:row.attemptCount+1,leaseUntil:new Date(now.getTime()+120_000),updatedAt:now})
      .where(eq(s.kickoffDeliveries.id,row.id)).returning();
    await audit(tx,row.id,"claimed",undefined,attemptId);return claimed!;
  });
}

async function lockedAttempt(db:Db,id:string,attemptId:string) {
  const [row]=await db.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.id,id),eq(s.kickoffDeliveries.attemptId,attemptId))).for("update");
  if(!row)throw new Error("kickoff_delivery_attempt_changed");return row;
}

export async function bindKickoffCalendar(id:string,attemptId:string,calendarId:string,db:Db=getDb()) {
  return db.transaction(async tx=>{
    const row=await lockedAttempt(tx,id,attemptId);
    if(row.status!=="processing")throw new Error("kickoff_delivery_not_claimed");
    const [prior]=await tx.select({calendarId:s.kickoffDeliveries.calendarId}).from(s.kickoffDeliveries)
      .where(and(eq(s.kickoffDeliveries.bookingId,row.bookingId),isNotNull(s.kickoffDeliveries.calendarId))).orderBy(asc(s.kickoffDeliveries.sequence)).limit(1);
    const bound=prior?.calendarId??row.calendarId??calendarId;
    await tx.update(s.kickoffDeliveries).set({calendarId:bound}).where(eq(s.kickoffDeliveries.id,id));return bound;
  });
}

export async function verifyKickoffCalendar(id:string,attemptId:string,db:Db=getDb()) {
  await db.transaction(async tx=>{
    await lockDeliveryContext(tx,id);
    const row=await lockedAttempt(tx,id,attemptId);if(row.status!=="processing")throw new Error("kickoff_delivery_not_claimed");
    await tx.update(s.kickoffDeliveries).set({calendarVerifiedAt:new Date(),issueCode:null,updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,id));
    await tx.update(s.bookings).set({googleEventId:row.googleEventId}).where(eq(s.bookings.id,row.bookingId));
    await audit(tx,id,"calendar_verified",undefined,attemptId);
  });
}

export async function startKickoffEmail(id:string,attemptId:string,db:Db=getDb()) {
  await db.transaction(async tx=>{
    const row=await lockedAttempt(tx,id,attemptId);
    if(row.status!=="processing" || !row.calendarVerifiedAt || row.mailStartedAt)throw new Error("kickoff_email_not_startable");
    await tx.update(s.kickoffDeliveries).set({mailStartedAt:new Date(),updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,id));
    await audit(tx,id,"email_started",undefined,attemptId);
  });
}

export async function finishKickoffEmail(id:string,attemptId:string,accepted:readonly string[],rejected:readonly string[],db:Db=getDb()) {
  await db.transaction(async tx=>{
    await lockDeliveryContext(tx,id);
    const row=await lockedAttempt(tx,id,attemptId);if(!row.mailStartedAt)throw new Error("kickoff_email_not_started");
    const yes=new Set(accepted.map(email=>email.toLowerCase())),no=new Set(rejected.map(email=>email.toLowerCase()));
    if(row.recipients.some(person=>yes.has(person.email)===no.has(person.email)))throw new Error("kickoff_email_recipient_outcome_unknown");
    const recipients=row.recipients.map(person=>({...person,status:no.has(person.email)?"failed" as const:person.status==="pending"?"accepted" as const:person.status}));
    const outcome=recipientOutcome(recipients);
    const [updated]=await tx.update(s.kickoffDeliveries).set({recipients,mailAcceptedAt:new Date(),status:outcome==="failed"?"needs_attention":outcome==="delivered"?"delivered":"awaiting_delivery",
      issueCode:outcome==="failed"?"recipient_rejected":null,leaseUntil:null,updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,id)).returning();
    await audit(tx,id,"email_handoff",outcome==="failed"?"recipient_rejected":undefined,attemptId);
    await projectDelivery(updated!,tx);
  });
}

export async function failKickoffDelivery(id:string,attemptId:string,code:string,retryable:boolean,db:Db=getDb()) {
  await db.transaction(async tx=>{
    const row=await lockedAttempt(tx,id,attemptId);
    if(row.status==="delivered")return;
    const retry=retryable&&!row.mailStartedAt&&row.attemptCount<5;
    await tx.update(s.kickoffDeliveries).set({status:retry?"queued":"needs_attention",issueCode:code,leaseUntil:null,
      nextAttemptAt:new Date(Date.now()+Math.min(60_000*2**(row.attemptCount-1),300_000)),updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,id));
    await audit(tx,id,retry?"retry_scheduled":"attention_required",code,attemptId);
  });
}

export async function recordKickoffReceipt(receipt:KickoffReceipt,db:Db=getDb()) {
  return db.transaction(async tx=>{
    // Serializes duplicate provider event IDs even when they name different operations.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receipt.providerEventId}, 17))`);
    const [prior]=await tx.select().from(s.kickoffDeliveryReceipts).where(eq(s.kickoffDeliveryReceipts.providerEventId,receipt.providerEventId));
    if(prior)return [...new Set([...Object.keys(receipt),...Object.keys(prior.payload)])].every(key=>prior.payload[key as keyof KickoffReceipt]===receipt[key as keyof KickoffReceipt])?{kind:"duplicate" as const}:{kind:"receipt_conflict" as const};
    await lockDeliveryContext(tx,receipt.deliveryId);
    const [row]=await tx.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.id,receipt.deliveryId)).for("update");
    if(!row)return {kind:"not_found" as const};
    if((receipt.providerMessageId && row.providerMessageId && row.providerMessageId!==receipt.providerMessageId) || row.messageId!==receipt.messageId || !row.mailStartedAt || !row.recipients.some(person=>person.email===receipt.recipient))return {kind:"receipt_mismatch" as const};
    const recipients=receiptRecipients(row.recipients,receipt),outcome=recipientOutcome(recipients);
    const allResolved=recipients.every(person=>person.status==="delivered"||person.status==="failed");
    await tx.insert(s.kickoffDeliveryReceipts).values({providerEventId:receipt.providerEventId,deliveryId:row.id,payload:receipt});
    const [updated]=await tx.update(s.kickoffDeliveries).set({recipients,
      ...(receipt.providerMessageId?{providerMessageId:receipt.providerMessageId}:{}),
      ...(allResolved?{mailAcceptedAt:row.mailAcceptedAt??new Date()}:{}),
      ...(outcome==="failed"?{status:"needs_attention" as const,issueCode:"recipient_delivery_failed"}:outcome==="delivered"&&row.calendarVerifiedAt?{status:"delivered" as const,issueCode:null,leaseUntil:null}:{}),updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,row.id)).returning();
    await audit(tx,row.id,"provider_receipt",receipt.status,row.attemptId);await projectDelivery(updated!,tx);return {kind:"recorded" as const};
  });
}

export async function retryKickoffDelivery(workspaceId:string,id:string,actorUserId:string,db:Db=getDb()) {
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.id,id),eq(s.kickoffDeliveries.workspaceId,workspaceId))).for("update");
    if(!row)return {kind:"not_found" as const};
    if(row.mailStartedAt || row.status!=="needs_attention")return {kind:"retry_requires_reconciliation" as const};
    await tx.update(s.kickoffDeliveries).set({status:"queued",issueCode:null,nextAttemptAt:new Date(),deadlineAt:new Date(Date.now()+900_000),attemptCount:0,updatedAt:new Date()}).where(eq(s.kickoffDeliveries.id,id));
    await audit(tx,id,"retry_requested",actorUserId);return {kind:"queued" as const};
  });
}

export async function kickoffDeliveryReport(workspaceId:string,db:Db=getDb(),now=new Date()) {
  const rows=await db.select({id:s.kickoffDeliveries.id,bookingId:s.kickoffDeliveries.bookingId,kind:s.kickoffDeliveries.kind,status:s.kickoffDeliveries.status,ownerUserId:s.kickoffDeliveries.ownerUserId,
    issueCode:s.kickoffDeliveries.issueCode,attemptCount:s.kickoffDeliveries.attemptCount,deadlineAt:s.kickoffDeliveries.deadlineAt,updatedAt:s.kickoffDeliveries.updatedAt})
    .from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.workspaceId,workspaceId)).orderBy(desc(s.kickoffDeliveries.sequence)).limit(200);
  const [counts]=await db.select({attention:sql<number>`count(*) filter (where ${s.kickoffDeliveries.status} = 'needs_attention')::int`,
    overdue:sql<number>`count(*) filter (where ${s.kickoffDeliveries.status} not in ('delivered','superseded') and ${s.kickoffDeliveries.deadlineAt} < ${now})::int`})
    .from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.workspaceId,workspaceId));
  const [reservationCounts]=await db.select({attention:sql<number>`count(*)::int`}).from(s.followupReservations)
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.followupReservations.onboardingId))
    .where(and(eq(s.franchiseOnboarding.workspaceId,workspaceId),eq(s.followupReservations.status,"blocked")));
  const reservationAttention=reservationCounts?.attention??0;
  const [worker]=await db.select().from(s.kickoffDeliveryWorker).where(eq(s.kickoffDeliveryWorker.name,"dispatcher"));
  const workerStale=!worker||now.getTime()-worker.lastSweepAt.getTime()>180_000;
  const automation=await followupAutomationHealth(workspaceId,db,now);
  const [feedback]=await db.select().from(s.kickoffDeliveryWorker).where(eq(s.kickoffDeliveryWorker.name,"ses-feedback"));
  const feedbackStale=!feedback||now.getTime()-feedback.lastSweepAt.getTime()>180_000;
  return {workspaceId,feedbackStale,feedbackLastPollAt:feedback?.lastSweepAt??null,...automation,checkedAt:now.toISOString(),workerStale:workerStale||automation.schedulerStale,lastSweepAt:worker?.lastSweepAt??null,attention:(counts?.attention??0)+reservationAttention+automation.extensionAttention,reservationAttention,overdue:(counts?.overdue??0)+automation.reservationOverdue+automation.extensionOverdue,deliveries:rows};
}

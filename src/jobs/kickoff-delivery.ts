import { loadKickoffContext } from "../db/kickoff-context";
import { guardKickoffBooking } from "../db/kickoff-booking-guard";
import { Temporal } from "@js-temporal/polyfill";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, lt } from "drizzle-orm";
import { getAuth } from "../auth/index";
import { getDb } from "../db/client";
import { listBookingsNeedingReminder } from "../db/booking-repo";
import { getWritableConnectionForUser } from "../db/sync-repo";
import { bindKickoffCalendar,claimKickoffDelivery,failKickoffDelivery,finishKickoffEmail,isKickoffDeliveryBooking,queueKickoffReminder,restoreInviteContext,startKickoffEmail,supersedeKickoffDelivery,sweepKickoffDeliveries,verifyKickoffCalendar,type Delivery } from "../db/kickoff-delivery-repo";
import { isMailerConfigured,sendInviteMail,type InviteMail,type SendResult } from "../notifications/mailer";
import { KickoffProviderError,syncKickoffGoogle } from "../sync/kickoff-google";
import { buildMail,REMINDER_LEAD } from "./invite-email";
import * as s from "../db/schema";

export interface KickoffDeliveryDeps {
  configurationIssue:()=>string|null;
  credentials:(delivery:Delivery)=>Promise<{calendarId:string;accessToken:string}>;
  calendar:typeof syncKickoffGoogle;
  mail:(mail:InviteMail)=>Promise<SendResult>;
}
const defaults:KickoffDeliveryDeps={
  configurationIssue:()=>{
    if(!isMailerConfigured())return "mail_configuration_missing";
    if(!process.env.KICKOFF_DELIVERY_WEBHOOK_SECRET)return "delivery_feedback_not_configured";
    try {if(new URL(process.env.PUBLIC_URL??"").protocol!=="https:")return "public_url_not_configured";}catch{return "public_url_not_configured";}
    return null;
  },
  credentials:async delivery=>{
    const organizer=delivery.snapshot.hosts[0];if(!organizer)throw new KickoffProviderError("organizer_missing");
    const connection=await getWritableConnectionForUser(organizer.id);if(!connection)throw new KickoffProviderError("organizer_calendar_missing");
    const token=await getAuth().api.getAccessToken({body:{providerId:"google",userId:organizer.id}});
    if(!token.accessToken)throw new KickoffProviderError("organizer_authorization_missing");
    return {calendarId:connection.externalCalendarId,accessToken:token.accessToken};
  },calendar:syncKickoffGoogle,mail:sendInviteMail,
};

export async function processKickoffDelivery(row:Delivery,deps:KickoffDeliveryDeps=defaults,db:NodePgDatabase<typeof s>=getDb()) {
  const attempt=row.attemptId;if(!attempt)throw new Error("kickoff_delivery_not_claimed");
  let mailStarted=false;
  try {
    const configurationIssue=deps.configurationIssue();if(configurationIssue)throw new KickoffProviderError(configurationIssue);
    if(row.kind==="reminder") {
      const [booking]=await db.select().from(s.bookings).where(eq(s.bookings.id,row.bookingId));
      const until=booking?booking.startsAt.getTime()-Date.now():0;
      if(!booking||booking.status!=="confirmed"||until<=0||until>86400_000||booking.startsAt.toISOString()!==new Date(row.snapshot.booking.startsAt).toISOString()) {
        await supersedeKickoffDelivery(row.id,attempt,db);return;
      }
    }
    if(row.snapshot.meetingKind==="followup") {
      const issue=await db.transaction(async tx=>{
        const [booking]=await tx.select().from(s.bookings).where(eq(s.bookings.id,row.bookingId));
        if(!booking)return "followup_booking_missing";
        const ctx=await loadKickoffContext(booking.eventTypeId,tx);
        if(!ctx||ctx.meetingKind!=="followup")return "followup_configuration_missing";
        const [kickoff]=ctx.binding.kickoffBookingId?await tx.select({booking:s.bookings}).from(s.bookings)
          .innerJoin(s.onboardingKickoffs,eq(s.onboardingKickoffs.eventTypeId,s.bookings.eventTypeId))
          .where(and(eq(s.bookings.id,ctx.binding.kickoffBookingId),eq(s.onboardingKickoffs.onboardingId,ctx.onboarding.id))):[];
        if(!kickoff||kickoff.booking.status!=="confirmed"||kickoff.booking.inviteStatus!=="delivered")return "kickoff_delivery_unverified";
        const result=await guardKickoffBooking(booking.eventTypeId,booking.hostUserIds,{start:Temporal.Instant.from(booking.startsAt.toISOString()),end:Temporal.Instant.from(booking.endsAt.toISOString())},tx,booking.id);
        return result.kind==="allowed"?null:result.kind==="blocked"?result.error:"followup_configuration_missing";
      });
      if(issue)throw new KickoffProviderError(issue);
    }
    const credentials=await deps.credentials(row);
    const calendarId=await bindKickoffCalendar(row.id,attempt,credentials.calendarId,db);
    // A booking moved before its first dispatch has no Google event yet.
    // Only durable evidence that every earlier operation was untouched permits
    // creating it; a missing previously dispatched event still needs review.
    const earlier=row.kind==="rescheduled"?await db.select().from(s.kickoffDeliveries).where(and(
      eq(s.kickoffDeliveries.bookingId,row.bookingId),lt(s.kickoffDeliveries.sequence,row.sequence),
    )):[];
    const initialReschedule=row.kind==="rescheduled"&&earlier.some(item=>item.kind==="created")
      &&earlier.every(item=>item.status==="superseded"&&item.attemptCount===0&&!item.calendarId);
    await deps.calendar(initialReschedule?{...row,kind:"created"}:row,calendarId,credentials.accessToken);
    await verifyKickoffCalendar(row.id,attempt,db);
    const mail={...buildMail(restoreInviteContext(row.snapshot),row.kind,Temporal.Now.instant(),{includeIcs:false}),messageId:row.messageId};
    await startKickoffEmail(row.id,attempt,db);mailStarted=true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const result=await Promise.race([deps.mail(mail),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("email_timeout")),30_000);})]).finally(()=>{if(timer)clearTimeout(timer);});
    await finishKickoffEmail(row.id,attempt,result.accepted??[],result.rejected,db);
  } catch(error) {
    const code=mailStarted?"email_outcome_unknown":error instanceof KickoffProviderError?error.code:"delivery_preflight_failed";
    await failKickoffDelivery(row.id,attempt,code,!mailStarted&&error instanceof KickoffProviderError&&error.retryable,db);
  }
}

export async function runKickoffDeliveryBatch(deps:KickoffDeliveryDeps=defaults,db:NodePgDatabase<typeof s>=getDb()) {
  // Discover due reminders here as well: their durable intent must not depend
  // on the generic email queue accepting a separate reminder job.
  for(const bookingId of await listBookingsNeedingReminder(Temporal.Now.instant(),REMINDER_LEAD,db)) {
    if(await isKickoffDeliveryBooking(bookingId,db))await queueKickoffReminder(bookingId,db);
  }
  await sweepKickoffDeliveries(db);
  // One bounded batch; the durable queue remains authoritative across restarts.
  for(let i=0;i<10;i++) {
    const row=await claimKickoffDelivery(db);if(!row)break;
    await processKickoffDelivery(row,deps,db);
    await db.insert(s.kickoffDeliveryWorker).values({name:"dispatcher",lastSweepAt:new Date()})
      .onConflictDoUpdate({target:s.kickoffDeliveryWorker.name,set:{lastSweepAt:new Date()}});
  }
}

import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { BookingEvent } from "../core/booking/state";
import type { KickoffContext } from "./kickoff-context";
import * as s from "./schema";
/** Only the atomic reviewed-plan transaction can satisfy this proof: its
 * immutable audit, current revision, occurrence and booking must all agree. */
export async function authorizeFollowupChange(ctx:KickoffContext,bookingId:string,event:BookingEvent,requestId:string|undefined,db:NodePgDatabase<typeof s>) {
  if(!requestId||ctx.meetingKind!=="followup"||!["rescheduled","cancelled"].includes(event.kind))return false;
  const [audit]=await db.select().from(s.onboardingFollowupChanges).where(and(eq(s.onboardingFollowupChanges.onboardingId,ctx.onboarding.id),eq(s.onboardingFollowupChanges.requestId,requestId),eq(s.onboardingFollowupChanges.revision,ctx.onboarding.revision)));
  const [binding]=await db.select({occurrence:s.onboardingFollowupOccurrences,booking:s.bookings}).from(s.followupReservations)
    .innerJoin(s.onboardingFollowupOccurrences,eq(s.onboardingFollowupOccurrences.id,s.followupReservations.occurrenceId))
    .innerJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId))
    .where(and(eq(s.followupReservations.bookingId,bookingId),eq(s.followupReservations.onboardingId,ctx.onboarding.id)));
  if(!audit||!binding||binding.booking.status!=="confirmed"||binding.booking.startsAt<=new Date())return false;
  const change=audit.changes.find(row=>row.id===binding.occurrence.id);
  if(!change||change.previousStartsAt!==binding.booking.startsAt.toISOString())return false;
  if(event.kind==="cancelled")return ["cancel","pause"].includes(change.action)&&["cancelled","paused"].includes(binding.occurrence.status);
  return event.kind==="rescheduled"&&change.action==="move"&&binding.occurrence.status==="draft"
    &&change.startsAt===event.payload.startsAt.toString({smallestUnit:"millisecond"})&&change.endsAt===event.payload.endsAt.toString({smallestUnit:"millisecond"})
    &&binding.occurrence.startsAt.getTime()===event.payload.startsAt.epochMilliseconds&&binding.occurrence.endsAt.getTime()===event.payload.endsAt.epochMilliseconds;
}

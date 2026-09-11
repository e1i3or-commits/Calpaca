import { and, eq, inArray } from "drizzle-orm";
import { Temporal } from "@js-temporal/polyfill";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ScheduleChange } from "../core/engagement/followup-schedule";
import { appendEvent } from "./booking-repo";
import * as s from "./schema";
type Db=NodePgDatabase<typeof s>;
export class FollowupReconciliationBlocked extends Error {}
/** Invoked after the reviewed audit and occurrence updates, in their same
 * transaction. Any conflict must roll all of them back together. */
export async function reconcileFollowupChanges(onboardingId:string,requestId:string,changes:ScheduleChange[],actorUserId:string,db:Db) {
  for(const change of changes) {
    if(!change.id||!["move","cancel","pause"].includes(change.action))continue;
    const [binding]=await db.select({booking:s.bookings}).from(s.followupReservations)
      .innerJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId))
      .where(and(eq(s.followupReservations.occurrenceId,change.id),eq(s.followupReservations.onboardingId,onboardingId)));
    if(!binding||binding.booking.status==="cancelled")continue;
    if(binding.booking.status!=="confirmed")throw new FollowupReconciliationBlocked("A meeting is no longer confirmed. Refresh its status before changing the schedule.");
    // Lock every existing operation against dispatcher claims. A dispatched
    // uncertain operation must reconcile before we issue a newer version.
    const operations=await db.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.bookingId,binding.booking.id)).for("update");
    if(operations.some(row=>row.status==="processing"))throw new FollowupReconciliationBlocked("An invitation is being dispatched. Retry the reviewed change after dispatch finishes.");
    if(operations.some(row=>!["delivered","superseded","awaiting_delivery"].includes(row.status)&&row.attemptCount>0&&!row.mailAcceptedAt))throw new FollowupReconciliationBlocked("An earlier invitation has an unresolved provider outcome. Resolve its assigned delivery issue first.");
    if(change.action==="move"&&change.status!=="draft")continue;
    const kind=change.action==="move"?"rescheduled":"cancelled";
    const result=await appendEvent(binding.booking.id,kind,kind==="rescheduled"?{startsAt:Temporal.Instant.from(change.startsAt),endsAt:Temporal.Instant.from(change.endsAt)}:{reason:change.action==="pause"?"Onboarding schedule paused":"Onboarding schedule ended or meeting removed"},db,undefined,requestId);
    if(!result.ok)throw new FollowupReconciliationBlocked(`The calendar change could not be reserved (${result.error.reason}). Existing dates have been preserved.`);
    await db.insert(s.followupReservationEvents).values({occurrenceId:change.id,actorUserId,outcome:kind});
    await db.update(s.followupReservations).set({issueCode:null,status:"reserved",updatedAt:new Date()}).where(eq(s.followupReservations.occurrenceId,change.id));
  }
  // A paused or removed unbooked date no longer requires a reservation retry.
  const inactive=changes.filter(row=>row.id&&["pause","cancel"].includes(row.action)).map(row=>row.id!);
  if(inactive.length)await db.update(s.followupReservations).set({issueCode:null,status:"reserved",updatedAt:new Date()})
    .where(and(eq(s.followupReservations.onboardingId,onboardingId),inArray(s.followupReservations.occurrenceId,inactive)));
}

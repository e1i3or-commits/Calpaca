import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { GoogleEvent } from "../sync/busy-mapping";
import { kickoffHosts, loadKickoffContext } from "./kickoff-context";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;

/** Import time changes only from the organizer's bound event. Never send an
 * invitation or write back to Google: this records an already-observed change.
 * A blocked reconciliation throws before the sync cursor advances, so a later
 * sync retries it and the connection is flagged unhealthy by the sync worker. */
export async function reconcileCalendarBookingTimes(connectionId: string, events: GoogleEvent[], db: Db, now = new Date()) {
  const [connection] = await db.select({calendar:s.calendarConnections,email:s.users.email}).from(s.calendarConnections)
    .innerJoin(s.users,eq(s.users.id,s.calendarConnections.userId)).where(eq(s.calendarConnections.id,connectionId));
  if (!connection) return;
  for (const event of events) {
    // Attendee copies and unrelated events cannot mutate protected bookings.
    const [candidate] = await db.select().from(s.kickoffDeliveries).where(and(eq(s.kickoffDeliveries.googleEventId,event.id),inArray(s.kickoffDeliveries.kind,["created","rescheduled"]))).orderBy(desc(s.kickoffDeliveries.sequence)).limit(1);
    if (!candidate || candidate.snapshot.hosts[0]?.id !== connection.calendar.userId) continue;
    const bound = candidate.calendarId === "primary" ? connection.email.toLowerCase() : candidate.calendarId;
    const observed = connection.calendar.externalCalendarId === "primary" ? connection.email.toLowerCase() : connection.calendar.externalCalendarId;
    if (!bound || bound !== observed) continue;
    // Cancellation, recurrence replacement and attendee changes remain separate
    // operations; this importer is deliberately restricted to timed meetings.
    if (event.status !== "confirmed") continue;
    const props = event.extendedProperties?.private;
    if (event.organizer?.email?.toLowerCase() !== connection.email.toLowerCase()
      || props?.tourscaleBookingId !== candidate.bookingId) throw new Error("calendar_booking_identity_conflict");
    const start = new Date(event.start?.dateTime ?? ""), end = new Date(event.end?.dateTime ?? ""), updated = new Date(event.updated ?? "");
    if (!event.etag || !Number.isFinite(updated.getTime()) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
      throw new Error("calendar_booking_time_invalid");
    await db.transaction(async tx => {
      await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,candidate.workspaceId)).for("update");
      const [before] = await tx.select().from(s.bookings).where(and(eq(s.bookings.id,candidate.bookingId),eq(s.bookings.workspaceId,candidate.workspaceId)));
      if (!before || before.status !== "confirmed") return;
      const context = await loadKickoffContext(before.eventTypeId,tx);
      if (!context || context.onboarding.workspaceId !== candidate.workspaceId) throw new Error("calendar_booking_context_missing");
      for (const host of [...kickoffHosts(context)].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${host},0))`);
      const [booking] = await tx.select().from(s.bookings).where(eq(s.bookings.id,before.id)).for("update");
      if (!booking || booking.status !== "confirmed") return;
      const operations = await tx.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.bookingId,booking.id)).orderBy(desc(s.kickoffDeliveries.sequence)).for("update");
      const latest = operations.find(row => row.kind !== "reminder");
      if (!latest || latest.id !== candidate.id || latest.kind === "cancelled") return;
      // An explicit Calpaca operation owns the next calendar version. Its
      // durable delivery queue handles failures; do not block that writer
      // by marking its required availability sync unhealthy.
      if (latest.status !== "delivered") return;
      if (latest.calendarVerifiedAt && updated < latest.calendarVerifiedAt) return;
      if (props?.tourscaleDeliveryId !== latest.id || props?.tourscaleSequence !== String(latest.sequence)) throw new Error("calendar_booking_version_conflict");
      const [seen] = await tx.select().from(s.bookingCalendarObservations).where(eq(s.bookingCalendarObservations.bookingId,booking.id));
      if (seen && updated <= seen.providerUpdatedAt) return;
      const differs = booking.startsAt.getTime() !== start.getTime() || booking.endsAt.getTime() !== end.getTime();
      // Never import an old read over a newer Calpaca write or uncertain send.
      if (differs && operations.some(row => row.status === "processing" || (row.kind !== "reminder" && !["delivered","superseded"].includes(row.status))))
        throw new Error("calendar_booking_delivery_unsettled");
      if (differs) {
        const [occurrence] = await tx.select({row:s.onboardingFollowupOccurrences}).from(s.followupReservations)
          .innerJoin(s.onboardingFollowupOccurrences,eq(s.onboardingFollowupOccurrences.id,s.followupReservations.occurrenceId))
          .where(and(eq(s.followupReservations.bookingId,booking.id),eq(s.followupReservations.onboardingId,context.onboarding.id)));
        if (context.meetingKind === "followup" && (!occurrence || occurrence.row.status !== "draft")) throw new Error("calendar_followup_not_active");
        const [onboarding] = await tx.select().from(s.franchiseOnboarding).where(eq(s.franchiseOnboarding.id,context.onboarding.id)).for("update");
        const [followup] = occurrence ? await tx.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId,context.onboarding.id)) : [];
        if (occurrence && followup?.approvedRevision !== onboarding!.revision) throw new Error("calendar_followup_revision_conflict");
        // Preserve the prior verified invitation state: Google already owns
        // this edit, and we must not fabricate a new email-delivery receipt.
        await tx.insert(s.bookingEvents).values({bookingId:booking.id,kind:"rescheduled",payload:{startsAt:start.toISOString(),endsAt:end.toISOString(),calendarObserved:true,calendarEventId:event.id,providerUpdatedAt:updated.toISOString(),etag:event.etag,previousStartsAt:booking.startsAt.toISOString(),previousEndsAt:booking.endsAt.toISOString()},createdAt:now});
        await tx.update(s.bookings).set({startsAt:start,endsAt:end}).where(eq(s.bookings.id,booking.id));
        if (occurrence) {
          await tx.update(s.onboardingFollowupOccurrences).set({startsAt:start,endsAt:end,exception:true,updatedAt:now}).where(eq(s.onboardingFollowupOccurrences.id,occurrence.row.id));
          await tx.update(s.onboardingFollowups).set({approvedRevision:onboarding!.revision+1}).where(eq(s.onboardingFollowups.onboardingId,onboarding!.id));
        }
        await tx.update(s.franchiseOnboarding).set({revision:onboarding!.revision+1,updatedAt:now}).where(eq(s.franchiseOnboarding.id,onboarding!.id));
        await tx.insert(s.franchiseOnboardingChanges).values({workspaceId:candidate.workspaceId,onboardingId:onboarding!.id,actorUserId:connection.calendar.userId,revision:onboarding!.revision+1,kind:"calendar_time_observed",cadence:onboarding!.cadence});
        await tx.update(s.engagements).set({updatedAt:now}).where(eq(s.engagements.id,onboarding!.engagementId));
        for (const old of operations.filter(row => row.kind === "reminder" && !row.mailStartedAt && ["queued","needs_attention"].includes(row.status))) {
          await tx.update(s.kickoffDeliveries).set({status:"superseded",issueCode:"calendar_time_reconciled",updatedAt:now}).where(eq(s.kickoffDeliveries.id,old.id));
          await tx.insert(s.kickoffDeliveryEvents).values({deliveryId:old.id,kind:"superseded",code:"calendar_time_reconciled"});
        }
        // If a later-ended meeting had already been deferred, allow the notes
        // worker to re-evaluate immediately; its end-time gate still applies.
        await tx.update(s.meetingNotesJobs).set({nextAttemptAt:now}).where(and(eq(s.meetingNotesJobs.bookingId,booking.id),isNull(s.meetingNotesJobs.completedAt),isNull(s.meetingNotesJobs.leaseToken)));
      }
      await tx.insert(s.bookingCalendarObservations).values({bookingId:booking.id,providerUpdatedAt:updated,etag:event.etag!,observedAt:now})
        .onConflictDoUpdate({target:s.bookingCalendarObservations.bookingId,set:{providerUpdatedAt:updated,etag:event.etag!,observedAt:now}});
    });
  }
}

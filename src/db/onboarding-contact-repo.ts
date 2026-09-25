import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { onboardingClientContactUpdate, sameClientContact, type OnboardingClientContact, type OnboardingClientContactUpdate } from "../core/engagement/franchise-onboarding";
import type { EngagementActor } from "../core/engagement/permissions";
import { appendEvent } from "./booking-repo";
import { getDb } from "./client";
import { getEngagement } from "./engagement-repo";
import { kickoffHosts, loadKickoffContext } from "./kickoff-context";
import { resolveClientContact } from "./onboarding-contact-state";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;
class ContactChangeBlocked extends Error {}

async function lock(workspaceId: string, engagementId: string, db: Db) {
  await db.select({id: s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id, workspaceId)).for("update");
  const [binding] = await db.select({eventTypeId: s.onboardingFollowups.eventTypeId}).from(s.onboardingFollowups)
    .innerJoin(s.franchiseOnboarding, eq(s.franchiseOnboarding.id, s.onboardingFollowups.onboardingId))
    .where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.franchiseOnboarding.engagementId, engagementId)));
  const context = binding ? await loadKickoffContext(binding.eventTypeId, db) : null;
  if (context) for (const host of [...kickoffHosts(context)].sort()) await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${host},0))`);
  await db.select({id: s.engagements.id}).from(s.engagements).where(and(eq(s.engagements.workspaceId, workspaceId), eq(s.engagements.id, engagementId))).for("update");
}

/** Saves who follow-ups invite and moves every booked future follow-up to that
 * person in the same transaction. Google swaps the attendee on the existing
 * event, so the previous address gets a cancellation and the new one an
 * invitation; the time and Meet link stay. Past meetings are never changed. */
export async function updateOnboardingClientContact(workspaceId: string, actor: EngagementActor, engagementId: string, raw: OnboardingClientContactUpdate, db: Db = getDb(), now = new Date()) {
  const input = onboardingClientContactUpdate.safeParse(raw); if (!input.success) return {kind: "invalid_input" as const};
  const value = input.data, next: OnboardingClientContact = {name: value.name, email: value.email, source: value.source};
  return db.transaction(async tx => {
    await lock(workspaceId, engagementId, tx);
    const engagement = await getEngagement(workspaceId, actor, engagementId, tx);
    const [onboarding] = await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.franchiseOnboarding.engagementId, engagementId)));
    if (!engagement || !onboarding) return {kind: "not_found" as const};
    if (!engagement.canManage) return {kind: "forbidden" as const};
    const [prior] = await tx.select().from(s.onboardingContactChanges).where(and(eq(s.onboardingContactChanges.onboardingId, onboarding.id), eq(s.onboardingContactChanges.requestId, value.requestId)));
    if (prior) return sameClientContact(prior.next, next) && prior.next.source === next.source
      ? {kind: "reused" as const, appliedRevision: prior.revision, contact: prior.next, updatedBookings: prior.bookingIds.length}
      : {kind: "request_conflict" as const};
    if (["archived", "completed"].includes(engagement.status)) return {kind: "engagement_closed" as const};
    if (onboarding.revision !== value.revision) return {kind: "revision_conflict" as const};
    const previous = await resolveClientContact(onboarding, tx);
    const affected = (await tx.select({booking: s.bookings}).from(s.followupReservations)
      .innerJoin(s.bookings, eq(s.bookings.id, s.followupReservations.bookingId))
      .where(and(eq(s.followupReservations.onboardingId, onboarding.id), eq(s.bookings.status, "confirmed"), gt(s.bookings.startsAt, now))))
      .map(row => row.booking).filter(booking => !sameClientContact({name: booking.inviteeName, email: booking.inviteeEmail}, next));
    if (previous && sameClientContact(previous, next) && previous.source === next.source && !affected.length)
      return {kind: "unchanged" as const, contact: previous, revision: onboarding.revision};
    for (const booking of affected) {
      // Same rule as reviewed schedule edits: an uncertain dispatch must
      // reconcile before a newer version of the invitation is issued.
      const operations = await tx.select().from(s.kickoffDeliveries).where(eq(s.kickoffDeliveries.bookingId, booking.id)).for("update");
      if (operations.some(row => row.status === "processing")) throw new ContactChangeBlocked("An invitation is being dispatched. Try again after dispatch finishes.");
      if (operations.some(row => !["delivered", "superseded", "awaiting_delivery"].includes(row.status) && row.attemptCount > 0 && !row.mailAcceptedAt))
        throw new ContactChangeBlocked("An earlier invitation has an unresolved provider outcome. Resolve its assigned delivery issue first.");
    }
    const [binding] = await tx.select().from(s.onboardingFollowups).where(eq(s.onboardingFollowups.onboardingId, onboarding.id));
    if (affected.length && !binding?.enabledAt) throw new ContactChangeBlocked("Calendar changes require the enabled follow-up binding. Restore that configuration first.");
    if (binding?.enabledAt && binding.approvedRevision !== value.revision) throw new ContactChangeBlocked("The follow-up approval is out of date. Review the current plan before changing the contact.");
    const revision = onboarding.revision + 1;
    await tx.update(s.franchiseOnboarding).set({clientContact: next, revision, updatedAt: now}).where(eq(s.franchiseOnboarding.id, onboarding.id));
    await tx.insert(s.franchiseOnboardingChanges).values({workspaceId, onboardingId: onboarding.id, actorUserId: actor.userId, revision, kind: "client_contact", cadence: onboarding.cadence});
    await tx.insert(s.onboardingContactChanges).values({onboardingId: onboarding.id, requestId: value.requestId, revision, actorUserId: actor.userId,
      previous: previous ?? {name: "", email: "", source: "kickoff"}, next, bookingIds: affected.map(booking => booking.id)});
    if (binding?.enabledAt) await tx.update(s.onboardingFollowups).set({approvedRevision: revision}).where(eq(s.onboardingFollowups.onboardingId, onboarding.id));
    for (const booking of affected) {
      await tx.update(s.bookings).set({inviteeEmail: next.email, inviteeName: next.name}).where(eq(s.bookings.id, booking.id));
      const result = await appendEvent(booking.id, "invitee_changed", {email: next.email, name: next.name, previousEmail: booking.inviteeEmail}, tx, undefined, value.requestId);
      if (!result.ok) throw new ContactChangeBlocked(`The invitation change could not be reserved (${result.error.reason}). Existing invitations have been preserved.`);
      const [reservation] = await tx.select({occurrenceId: s.followupReservations.occurrenceId}).from(s.followupReservations).where(eq(s.followupReservations.bookingId, booking.id));
      if (reservation) await tx.insert(s.followupReservationEvents).values({occurrenceId: reservation.occurrenceId, actorUserId: actor.userId, outcome: "invitee_changed"});
    }
    await tx.update(s.engagements).set({updatedAt: now}).where(eq(s.engagements.id, engagementId));
    return {kind: "applied" as const, appliedRevision: revision, contact: next, updatedBookings: affected.length};
  }).catch((error: unknown) => {
    if (error instanceof ContactChangeBlocked) return {kind: "calendar_reconciliation_blocked" as const, issues: [error.message]};
    throw error;
  });
}

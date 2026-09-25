import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { BookingEvent } from "../core/booking/state";
import type { OnboardingClientContact } from "../core/engagement/franchise-onboarding";
import type { KickoffContext } from "./kickoff-context";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;
type Onboarding = typeof s.franchiseOnboarding.$inferSelect;

/** The kickoff booking the franchisee made. Follow-up activation pins one;
 * before that, the latest confirmed kickoff booking is the best evidence. */
async function kickoffBooking(onboardingId: string, db: Db) {
  const [pinned] = await db.select({booking: s.bookings}).from(s.onboardingFollowups)
    .innerJoin(s.bookings, eq(s.bookings.id, s.onboardingFollowups.kickoffBookingId))
    .where(eq(s.onboardingFollowups.onboardingId, onboardingId));
  if (pinned) return pinned.booking;
  const [latest] = await db.select({booking: s.bookings}).from(s.onboardingKickoffs)
    .innerJoin(s.bookings, eq(s.bookings.eventTypeId, s.onboardingKickoffs.eventTypeId))
    .where(and(eq(s.onboardingKickoffs.onboardingId, onboardingId), eq(s.bookings.status, "confirmed")))
    .orderBy(desc(s.bookings.startsAt)).limit(1);
  return latest?.booking ?? null;
}

/** Who follow-ups invite: the saved contact, otherwise the kickoff invitee. */
export async function resolveClientContact(onboarding: Pick<Onboarding,"id"|"clientContact">, db: Db): Promise<OnboardingClientContact | null> {
  if (onboarding.clientContact) return onboarding.clientContact;
  const kickoff = await kickoffBooking(onboarding.id, db);
  return kickoff ? {name: kickoff.inviteeName, email: kickoff.inviteeEmail.toLowerCase(), source: "kickoff"} : null;
}

/** Only the contact-change transaction can satisfy this: its immutable audit,
 * the current revision, the listed booking and the booking row must agree. */
export async function authorizeInviteeChange(ctx: KickoffContext, bookingId: string, event: BookingEvent, requestId: string | undefined, db: Db) {
  if (!requestId || ctx.meetingKind !== "followup" || event.kind !== "invitee_changed") return false;
  const [audit] = await db.select().from(s.onboardingContactChanges).where(and(eq(s.onboardingContactChanges.onboardingId, ctx.onboarding.id),
    eq(s.onboardingContactChanges.requestId, requestId), eq(s.onboardingContactChanges.revision, ctx.onboarding.revision)));
  const [binding] = await db.select({booking: s.bookings}).from(s.followupReservations)
    .innerJoin(s.bookings, eq(s.bookings.id, s.followupReservations.bookingId))
    .where(and(eq(s.followupReservations.bookingId, bookingId), eq(s.followupReservations.onboardingId, ctx.onboarding.id)));
  if (!audit || !binding || binding.booking.status !== "confirmed" || binding.booking.startsAt <= new Date()) return false;
  return audit.bookingIds.includes(bookingId) && audit.next.email === event.payload.email && audit.next.name === event.payload.name
    && binding.booking.inviteeEmail === event.payload.email && binding.booking.inviteeName === event.payload.name;
}

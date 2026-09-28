import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;

/** Follow-up meetings of franchise onboardings that ended in (since, until],
 * with the calendar event their notes are attached to. Cancelled bookings and
 * meetings that were never delivered to a calendar are left out. */
export async function listEndedFollowups(workspaceId: string, since: Date, until: Date, db: Db = getDb()) {
  const rows = await db.select({ booking: s.bookings, onboarding: s.franchiseOnboarding }).from(s.followupReservations)
    .innerJoin(s.bookings, eq(s.bookings.id, s.followupReservations.bookingId))
    .innerJoin(s.franchiseOnboarding, eq(s.franchiseOnboarding.id, s.followupReservations.onboardingId))
    .where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.bookings.status, "confirmed"), gt(s.bookings.endsAt, since), lte(s.bookings.endsAt, until)))
    .orderBy(s.bookings.endsAt).limit(50);
  if (!rows.length) return [];
  const deliveries = await db.select().from(s.kickoffDeliveries).where(and(inArray(s.kickoffDeliveries.bookingId, rows.map((r) => r.booking.id)),
    inArray(s.kickoffDeliveries.kind, ["created", "rescheduled"]), eq(s.kickoffDeliveries.status, "delivered"))).orderBy(desc(s.kickoffDeliveries.sequence));
  return rows.flatMap(({ booking, onboarding }) => {
    const delivery = deliveries.find((d) => d.bookingId === booking.id);
    const organizer = delivery?.snapshot.hosts[0];
    if (!delivery?.calendarId || !organizer) return [];
    return [{ bookingId: booking.id, sourceProjectKey: onboarding.sourceProjectKey, sourceWorkspaceId: onboarding.sourceWorkspaceId,
      startsAt: booking.startsAt.toISOString(), endsAt: booking.endsAt.toISOString(),
      calendar: { organizerUserId: organizer.id, calendarId: delivery.calendarId, eventId: delivery.googleEventId } }];
  });
}
export type EndedFollowup = Awaited<ReturnType<typeof listEndedFollowups>>[number];

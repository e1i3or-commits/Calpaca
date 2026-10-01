import { and, desc, eq, gt, inArray, lte, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;

export interface MeetingPageCursor { endsAt: string; bookingId: string }

/** Follow-up meetings of franchise onboardings that ended in (since, until],
 * with the calendar event their notes are attached to. Cancelled bookings and
 * meetings that were never delivered to a calendar are left out. */
export async function listEndedFollowupsPage(workspaceId: string, since: Date, until: Date, cursor: MeetingPageCursor | null = null, db: Db = getDb()) {
  const rows = await db.select({ booking: s.bookings, onboarding: s.franchiseOnboarding }).from(s.bookings)
    .leftJoin(s.followupReservations, eq(s.bookings.id, s.followupReservations.bookingId))
    .leftJoin(s.onboardingOneOffs, eq(s.bookings.eventTypeId, s.onboardingOneOffs.eventTypeId))
    .innerJoin(s.franchiseOnboarding, or(eq(s.franchiseOnboarding.id, s.followupReservations.onboardingId),eq(s.franchiseOnboarding.id,s.onboardingOneOffs.onboardingId)))
    .where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.bookings.status, "confirmed"), gt(s.bookings.endsAt, since), lte(s.bookings.endsAt, until),
      cursor ? or(gt(s.bookings.endsAt, new Date(cursor.endsAt)), and(eq(s.bookings.endsAt, new Date(cursor.endsAt)), gt(s.bookings.id, cursor.bookingId))) : undefined))
    .orderBy(s.bookings.endsAt, s.bookings.id).limit(51);
  const page = rows.slice(0, 50);
  const last = page.at(-1)?.booking;
  // Advance on scanned rows, even when none have a delivered calendar event.
  const nextCursor = rows.length > 50 && last ? { endsAt: last.endsAt.toISOString(), bookingId: last.id } : null;
  if (!page.length) return { meetings: [], nextCursor };
  const deliveries = await db.select().from(s.kickoffDeliveries).where(and(inArray(s.kickoffDeliveries.bookingId, page.map((r) => r.booking.id)),
    inArray(s.kickoffDeliveries.kind, ["created", "rescheduled"]), eq(s.kickoffDeliveries.status, "delivered"))).orderBy(desc(s.kickoffDeliveries.sequence));
  const meetings = page.flatMap(({ booking, onboarding }) => {
    const delivery = deliveries.find((d) => d.bookingId === booking.id);
    const organizer = delivery?.snapshot.hosts[0];
    if (!delivery?.calendarId || !organizer) return [];
    return [{ bookingId: booking.id, sourceProjectKey: onboarding.sourceProjectKey, sourceWorkspaceId: onboarding.sourceWorkspaceId,
      startsAt: booking.startsAt.toISOString(), endsAt: booking.endsAt.toISOString(),
      calendar: { organizerUserId: organizer.id, calendarId: delivery.calendarId, eventId: delivery.googleEventId } }];
  });
  return { meetings, nextCursor };
}

// Compatibility for callers that only need one page. Automated consumers must
// use listEndedFollowupsPage and follow nextCursor, including empty pages.
export async function listEndedFollowups(workspaceId: string, since: Date, until: Date, db: Db = getDb()) {
  return (await listEndedFollowupsPage(workspaceId, since, until, null, db)).meetings;
}
export type EndedFollowup = Awaited<ReturnType<typeof listEndedFollowups>>[number];

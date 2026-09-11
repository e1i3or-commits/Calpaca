import { and, eq, gt, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "./schema";
export async function hasFollowupReservations(onboardingId:string,db:NodePgDatabase<typeof s>) {
  const [row]=await db.select({id:s.followupReservations.occurrenceId}).from(s.followupReservations).where(and(eq(s.followupReservations.onboardingId,onboardingId),isNotNull(s.followupReservations.bookingId))).limit(1);
  return !!row;
}

export async function hasFutureFollowupBookings(onboardingId:string,db:NodePgDatabase<typeof s>) {
  const [row]=await db.select({id:s.bookings.id}).from(s.followupReservations).innerJoin(s.bookings,eq(s.bookings.id,s.followupReservations.bookingId))
    .where(and(eq(s.followupReservations.onboardingId,onboardingId),eq(s.bookings.status,"confirmed"),gt(s.bookings.startsAt,new Date()))).limit(1);
  return !!row;
}

import { and, eq, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "./schema";
export async function hasFollowupReservations(onboardingId:string,db:NodePgDatabase<typeof s>) {
  const [row]=await db.select({id:s.followupReservations.occurrenceId}).from(s.followupReservations).where(and(eq(s.followupReservations.onboardingId,onboardingId),isNotNull(s.followupReservations.bookingId))).limit(1);
  return !!row;
}

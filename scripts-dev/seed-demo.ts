// Dev helper: give the first signed-in user a working-hours schedule and a
// solo event type so /book/intro-call renders against real synced busy data.
// Idempotent. Run: DISABLE_JOBS=1 bun run scripts-dev/seed-demo.ts
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { eventTypeHosts, eventTypes, schedules, users } from "../src/db/schema";

const SLUG = "intro-call";
const db = getDb();

const email = process.env.SEED_EMAIL ?? "kai@tourscale.com";
const [user] = await db.select().from(users).where(eq(users.email, email));
if (!user) {
  console.error(`no user with email ${email} — sign in first (SEED_EMAIL overrides)`);
  process.exit(1);
}

const weekdays = [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" }));
let [schedule] = await db.select().from(schedules).where(eq(schedules.userId, user.id));
if (!schedule) {
  [schedule] = await db
    .insert(schedules)
    .values({ userId: user.id, timezone: "America/New_York", rules: weekdays })
    .returning();
  console.log(`created schedule ${schedule!.id} (Mon-Fri 9-17 America/New_York)`);
} else {
  console.log(`schedule exists: ${schedule.id}`);
}

let [eventType] = await db.select().from(eventTypes).where(eq(eventTypes.slug, SLUG));
if (!eventType) {
  [eventType] = await db
    .insert(eventTypes)
    .values({
      ownerUserId: user.id,
      slug: SLUG,
      title: "Intro call",
      durationMinutes: 30,
      minimumNoticeMin: 60,
      scheduleId: schedule!.id,
    })
    .returning();
  console.log(`created event type ${eventType!.id} (/book/${SLUG})`);
} else {
  console.log(`event type exists: ${eventType.id}`);
}

await db
  .insert(eventTypeHosts)
  .values({ eventTypeId: eventType!.id, userId: user.id })
  .onConflictDoNothing();
console.log(`host: ${user.email}`);
process.exit(0);

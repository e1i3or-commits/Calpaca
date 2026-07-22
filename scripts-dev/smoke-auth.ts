// Dev smoke test: verifies the Google sign-in chain end to end.
// Run: bun run scripts-dev/smoke-auth.ts (reads .env.local from repo root).
// Prints token PRESENCE only, never token values.
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { getAuth } from "../src/auth/index";
import { listCalendars } from "../src/sync/google";

const db = getDb();

// Key on the google account row: test fixtures share this dev database and
// leave plain user rows behind.
const googleAccounts = await db
  .select()
  .from(schema.accounts)
  .where(eq(schema.accounts.providerId, "google"));
const google = googleAccounts[0];
if (!google) {
  console.log("FAIL: no google account row — sign-in did not complete");
  process.exit(1);
}
const [user] = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.id, google.userId));
if (!user) {
  console.log("FAIL: google account without user row");
  process.exit(1);
}
console.log(`user: ${user.email} (id ${user.id.slice(0, 8)}…) verified=${user.emailVerified}`);
console.log(
  `account: provider=google refreshToken=${google.refreshToken ? "PRESENT" : "MISSING"} ` +
    `accessToken=${google.accessToken ? "PRESENT" : "MISSING"}`,
);
console.log(`scopes: ${google.scope}`);

const conns = await db
  .select()
  .from(schema.calendarConnections)
  .where(eq(schema.calendarConnections.userId, user.id));
console.log(
  `calendar_connections: ${conns.length} row(s): ` +
    conns.map((c) => `${c.provider}/${c.externalCalendarId}`).join(", "),
);

const token = await getAuth().api.getAccessToken({
  body: { providerId: "google", userId: user.id },
});
console.log(`getAccessToken: ${token.accessToken ? "OK" : "FAIL"}`);

const cals = await listCalendars(token.accessToken);
if (!cals.ok) {
  console.log(`FAIL: listCalendars: ${JSON.stringify(cals.error)}`);
  process.exit(1);
}
console.log(`google calendarList: ${cals.value.length} calendars`);
for (const cal of cals.value) {
  console.log(`  - ${cal.summary}${cal.primary ? " [primary]" : ""} (${cal.accessRole})`);
}
console.log("SMOKE PASS");
process.exit(0);

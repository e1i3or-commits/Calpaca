// Dev helper: create the demo host the sign-in page's "Dev login" button uses,
// with a finished onboarding so it lands on the dashboard. Idempotent; resets
// the password. Pair with seed-demo.ts for a schedule and event type.
// Run: DISABLE_JOBS=1 bun run scripts-dev/seed-dev-login.ts
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb } from "../src/db/client";
import { accounts, users } from "../src/db/schema";
import { DEV_LOGIN_EMAIL, DEV_LOGIN_NAME, DEV_LOGIN_PASSWORD } from "../src/core/dev-login";

const CREDENTIAL_PROVIDER = "credential";
const db = getDb();

let [user] = await db.select().from(users).where(eq(users.email, DEV_LOGIN_EMAIL));
if (!user) {
  [user] = await db
    .insert(users)
    .values({
      email: DEV_LOGIN_EMAIL,
      name: DEV_LOGIN_NAME,
      emailVerified: true,
      timezone: "America/New_York",
      appRole: "admin",
      onboardingCompletedAt: new Date(),
    })
    .returning();
  console.log(`created user ${DEV_LOGIN_EMAIL}`);
} else {
  console.log(`user exists: ${DEV_LOGIN_EMAIL}`);
}

const password = await hashPassword(DEV_LOGIN_PASSWORD);
const credential = and(eq(accounts.userId, user!.id), eq(accounts.providerId, CREDENTIAL_PROVIDER));
const [existing] = await db.select({ id: accounts.id }).from(accounts).where(credential);
if (existing) {
  await db.update(accounts).set({ password, updatedAt: new Date() }).where(credential);
} else {
  await db.insert(accounts).values({
    userId: user!.id,
    accountId: user!.id,
    providerId: CREDENTIAL_PROVIDER,
    password,
  });
}
console.log("dev login ready");
process.exit(0);

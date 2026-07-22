import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/client";
import * as schema from "../db/schema";

// Calendar scopes ride the sign-in flow (ARCHITECTURE.md: no separate
// connect step). readonly covers busy reads; events covers writing the
// booking events themselves.
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

function buildAuth() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        // offline + consent: Google only issues a refresh token on an
        // explicit consent prompt; without it sync dies when the first
        // access token expires.
        accessType: "offline",
        prompt: "select_account consent",
        scope: GOOGLE_CALENDAR_SCOPES,
      },
    },
    advanced: {
      // Auth tables use uuid columns; BetterAuth's default ids are not uuids.
      database: { generateId: () => crypto.randomUUID() },
    },
    databaseHooks: {
      account: {
        create: {
          // First Google sign-in seeds the primary-calendar connection so a
          // new host has working busy-blocking before touching settings.
          after: async (account) => {
            if (account.providerId !== "google") return;
            const db = getDb();
            const existing = await db
              .select({ id: schema.calendarConnections.id })
              .from(schema.calendarConnections)
              .where(and(
                eq(schema.calendarConnections.userId, account.userId),
                eq(schema.calendarConnections.externalCalendarId, "primary"),
              ))
              .limit(1);
            if (existing.length > 0) return;
            await db.insert(schema.calendarConnections).values({
              userId: account.userId,
              provider: "google",
              externalCalendarId: "primary",
            });
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof buildAuth>;

let auth: Auth | undefined;

export function getAuth(): Auth {
  if (!auth) auth = buildAuth();
  return auth;
}

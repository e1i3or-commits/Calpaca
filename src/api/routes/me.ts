import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getAuth } from "../../auth/index";
import { requireSession, type AuthEnv } from "../../auth/session";
import { getDb } from "../../db/client";
import { calendarConnections } from "../../db/schema";
import { listCalendars } from "../../sync/google";

export const meRoutes = new Hono<AuthEnv>();

meRoutes.use("/api/me/*", requireSession);

// Live Google fetch is acceptable here: authenticated settings surface,
// never on the booking request path (that reads calendar_busy_cache only).
meRoutes.get("/api/me/calendars", async (c) => {
  const user = c.get("user");

  let accessToken: string;
  try {
    const token = await getAuth().api.getAccessToken({
      body: { providerId: "google", userId: user.id },
    });
    accessToken = token.accessToken;
  } catch {
    return c.json({ error: "no_google_connection" }, 409);
  }

  const calendars = await listCalendars(accessToken);
  if (!calendars.ok) {
    return c.json({ error: "google_unreachable", detail: calendars.error }, 502);
  }

  const connections = await getDb()
    .select({
      id: calendarConnections.id,
      externalCalendarId: calendarConnections.externalCalendarId,
      syncHealthy: calendarConnections.syncHealthy,
    })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, user.id));

  const connected = new Set(connections.map((c) => c.externalCalendarId));
  return c.json({
    calendars: calendars.value.map((cal) => ({
      ...cal,
      connected: connected.has(cal.id) || (cal.primary && connected.has("primary")),
    })),
  });
});

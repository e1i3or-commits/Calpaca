import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuth } from "../../auth/index";
import { requireSession, type AuthEnv } from "../../auth/session";
import { getDb } from "../../db/client";
import { calendarConnections } from "../../db/schema";
import {
  createConnection,
  deleteConnection,
  getConnection,
  type ConnectionRow,
} from "../../db/sync-repo";
import { listCalendars, stopChannel, type GoogleApiError, type GoogleCalendar } from "../../sync/google";
import { enqueueSync } from "../../jobs/index";
import type { Result } from "../../lib/result";

/** The signed-in host's calendar settings surface. Same injection convention
 * as webhook-admin so tests stub Google and the repo. */
export interface CalendarRouteDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  /** Throws when the user has no Google account linked. */
  readonly getAccessToken: (userId: string) => Promise<string>;
  readonly listCalendars: (accessToken: string) => Promise<Result<GoogleCalendar[], GoogleApiError>>;
  readonly listConnections: (
    userId: string,
  ) => Promise<{ id: string; externalCalendarId: string }[]>;
  readonly createConnection: (userId: string, externalCalendarId: string) => Promise<ConnectionRow>;
  readonly getConnection: (connectionId: string) => Promise<ConnectionRow | null>;
  readonly deleteConnection: (connectionId: string) => Promise<void>;
  readonly stopChannel: (args: {
    accessToken: string;
    channelId: string;
    resourceId: string;
  }) => Promise<Result<void, GoogleApiError>>;
  readonly enqueueSync: (connectionId: string) => Promise<void>;
}

const defaultDeps: CalendarRouteDeps = {
  requireAuth: requireSession,
  getAccessToken: async (userId) => {
    const token = await getAuth().api.getAccessToken({
      body: { providerId: "google", userId },
    });
    return token.accessToken;
  },
  listCalendars: (accessToken) => listCalendars(accessToken),
  listConnections: (userId) =>
    getDb()
      .select({
        id: calendarConnections.id,
        externalCalendarId: calendarConnections.externalCalendarId,
      })
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, userId)),
  createConnection: (userId, externalCalendarId) => createConnection(userId, externalCalendarId),
  getConnection: (connectionId) => getConnection(connectionId),
  deleteConnection: (connectionId) => deleteConnection(connectionId),
  stopChannel: (args) => stopChannel(args),
  enqueueSync: (connectionId) => enqueueSync(connectionId),
};

const connectBodySchema = z.object({ calendarId: z.string().min(1) });

/** The OAuth seed connection stores the "primary" alias while calendarList
 * returns the real id with primary=true — treat both as the same calendar. */
function connectionIdFor(
  cal: GoogleCalendar,
  connections: readonly { id: string; externalCalendarId: string }[],
): string | null {
  const match = connections.find(
    (conn) =>
      conn.externalCalendarId === cal.id || (cal.primary && conn.externalCalendarId === "primary"),
  );
  return match?.id ?? null;
}

export function createCalendarRoutes(deps: CalendarRouteDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.use("/api/me/*", deps.requireAuth);

  // Live Google fetch is acceptable here: authenticated settings surface,
  // never on the booking request path (that reads calendar_busy_cache only).
  router.get("/api/me/calendars", async (c) => {
    const user = c.get("user");

    let accessToken: string;
    try {
      accessToken = await deps.getAccessToken(user.id);
    } catch {
      return c.json({ error: "no_google_connection" }, 409);
    }

    const calendars = await deps.listCalendars(accessToken);
    if (!calendars.ok) {
      return c.json({ error: "google_unreachable", detail: calendars.error }, 502);
    }

    const connections = await deps.listConnections(user.id);
    return c.json({
      calendars: calendars.value.map((cal) => {
        const connectionId = connectionIdFor(cal, connections);
        return { ...cal, connected: connectionId !== null, connectionId };
      }),
    });
  });

  router.post("/api/me/calendars/connections", async (c) => {
    const user = c.get("user");

    const parsed = connectBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

    let accessToken: string;
    try {
      accessToken = await deps.getAccessToken(user.id);
    } catch {
      return c.json({ error: "no_google_connection" }, 409);
    }

    // connect only calendars Google says this account can see — the id is
    // caller input, not a trusted reference
    const calendars = await deps.listCalendars(accessToken);
    if (!calendars.ok) {
      return c.json({ error: "google_unreachable", detail: calendars.error }, 502);
    }
    const cal = calendars.value.find((x) => x.id === parsed.data.calendarId);
    if (!cal) return c.json({ error: "unknown_calendar" }, 404);

    const connections = await deps.listConnections(user.id);
    if (connectionIdFor(cal, connections) !== null) {
      return c.json({ error: "already_connected" }, 409);
    }

    const conn = await deps.createConnection(user.id, cal.id);
    // busy data now; the watch channel follows via the hourly renewal job
    await deps.enqueueSync(conn.id);
    return c.json({ connection: { id: conn.id, calendarId: cal.id } }, 201);
  });

  router.delete("/api/me/calendars/connections/:id", async (c) => {
    const user = c.get("user");

    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);

    const conn = await deps.getConnection(id);
    if (!conn || conn.userId !== user.id) return c.json({ error: "not_found" }, 404);

    // best-effort: a dangling channel expires on its own within a week, and
    // pushes for a deleted connection are dropped by the webhook route
    if (conn.channelId && conn.channelResourceId) {
      try {
        const accessToken = await deps.getAccessToken(user.id);
        const stopped = await deps.stopChannel({
          accessToken,
          channelId: conn.channelId,
          resourceId: conn.channelResourceId,
        });
        if (!stopped.ok) console.warn(`[me] stop channel for ${conn.id} failed:`, stopped.error);
      } catch (e) {
        console.warn(`[me] stop channel for ${conn.id} threw:`, e);
      }
    }

    await deps.deleteConnection(conn.id); // busy cache rows cascade
    return c.json({ ok: true });
  });

  return router;
}

export const meRoutes = createCalendarRoutes();

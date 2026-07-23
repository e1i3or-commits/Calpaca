import { describe, expect, test } from "bun:test";
import { createCalendarRoutes, type CalendarRouteDeps } from "../../src/api/routes/me";
import type { ConnectionRow } from "../../src/db/sync-repo";
import type { GoogleCalendar } from "../../src/sync/google";
import { err, ok } from "../../src/lib/result";

const HOST_ID = "11111111-1111-1111-1111-111111111111";
const CONN_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CONN_ID = "33333333-3333-3333-3333-333333333333";

const googleCalendars: GoogleCalendar[] = [
  { id: "host@example.test", summary: "Host", primary: true, accessRole: "owner" },
  { id: "team@group.calendar.google.com", summary: "Team", primary: false, accessRole: "reader" },
];

function connection(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: CONN_ID,
    userId: HOST_ID,
    provider: "google",
    // the OAuth seed stores the alias, not the real primary id
    externalCalendarId: "primary",
    conflictEnabled: true,
    isWriteDestination: false,
    channelId: null,
    channelResourceId: null,
    channelToken: null,
    channelExpiresAt: null,
    syncToken: null,
    lastSyncedAt: null,
    fullSyncedAt: null,
    syncHealthy: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CalendarRouteDeps> = {}): CalendarRouteDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: HOST_ID, email: "host@example.test", name: "Host" });
      await next();
    },
    getAccessToken: async () => "token-1",
    listCalendars: async () => ok(googleCalendars),
    listConnections: async () => [connection()],
    createConnection: async (userId, externalCalendarId) =>
      connection({ id: OTHER_CONN_ID, userId, externalCalendarId }),
    getConnection: async (id) => (id === CONN_ID ? connection() : null),
    deleteConnection: async () => {},
    updateConnectionPreferences: async (id, userId, patch) =>
      id === CONN_ID && userId === HOST_ID ? connection(patch) : null,
    stopChannel: async () => ok(undefined),
    enqueueSync: async () => {},
    ...overrides,
  };
}

describe("calendar connection routes", () => {
  test("every route requires a session", async () => {
    const router = createCalendarRoutes(
      makeDeps({ requireAuth: async (c) => c.json({ error: "unauthorized" }, 401) }),
    );
    expect((await router.request("/api/me/calendars")).status).toBe(401);
    expect(
      (await router.request("/api/me/calendars/connections", { method: "POST" })).status,
    ).toBe(401);
    expect(
      (await router.request(`/api/me/calendars/connections/${CONN_ID}`, { method: "DELETE" }))
        .status,
    ).toBe(401);
  });

  test("GET aliases the seed 'primary' connection onto the real primary calendar", async () => {
    const router = createCalendarRoutes(makeDeps());
    const res = await router.request("/api/me/calendars");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      calendars: { id: string; connected: boolean; connectionId: string | null }[];
    };
    const primary = body.calendars.find((c) => c.id === "host@example.test")!;
    expect(primary.connected).toBe(true);
    expect(primary.connectionId).toBe(CONN_ID);
    const team = body.calendars.find((c) => c.id === "team@group.calendar.google.com")!;
    expect(team.connected).toBe(false);
    expect(team.connectionId).toBeNull();
  });

  test("PATCH changes conflict checking and the write destination", async () => {
    const patches: object[] = [];
    const router = createCalendarRoutes(makeDeps({
      updateConnectionPreferences: async (_id, _userId, patch) => {
        patches.push(patch);
        return connection({ ...patch, isWriteDestination: true });
      },
    }));
    const conflicts = await router.request(
      `/api/me/calendars/connections/${CONN_ID}`,
      { method: "PATCH", body: JSON.stringify({ conflictEnabled: false }) },
    );
    expect(conflicts.status).toBe(200);
    const destination = await router.request(
      `/api/me/calendars/connections/${CONN_ID}`,
      { method: "PATCH", body: JSON.stringify({ isWriteDestination: true }) },
    );
    expect(destination.status).toBe(200);
    expect(patches).toEqual([
      { conflictEnabled: false },
      { isWriteDestination: true },
    ]);
  });

  test("PATCH rejects a read-only calendar as the write destination", async () => {
    const router = createCalendarRoutes(makeDeps({
      getConnection: async () => connection({
        externalCalendarId: "team@group.calendar.google.com",
      }),
    }));
    const response = await router.request(
      `/api/me/calendars/connections/${CONN_ID}`,
      { method: "PATCH", body: JSON.stringify({ isWriteDestination: true }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "calendar_not_writable" });
  });

  test("DELETE protects the active destination while another calendar exists", async () => {
    const router = createCalendarRoutes(makeDeps({
      listConnections: async () => [
        connection({ isWriteDestination: true }),
        connection({
          id: OTHER_CONN_ID,
          externalCalendarId: "team@group.calendar.google.com",
        }),
      ],
    }));
    const response = await router.request(
      `/api/me/calendars/connections/${CONN_ID}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "write_destination_required" });
  });

  test("GET maps missing Google link to 409 and Google failure to 502", async () => {
    const noLink = createCalendarRoutes(
      makeDeps({ getAccessToken: async () => { throw new Error("no account"); } }),
    );
    expect((await noLink.request("/api/me/calendars")).status).toBe(409);

    const down = createCalendarRoutes(
      makeDeps({ listCalendars: async () => err({ kind: "http_error", status: 500, message: "boom" }) }),
    );
    expect((await down.request("/api/me/calendars")).status).toBe(502);
  });

  test("POST validates the body", async () => {
    const router = createCalendarRoutes(makeDeps());
    for (const body of [undefined, "{", JSON.stringify({}), JSON.stringify({ calendarId: "" })]) {
      const res = await router.request("/api/me/calendars/connections", { method: "POST", body });
      expect(res.status).toBe(400);
    }
  });

  test("POST rejects calendars Google does not list for this account", async () => {
    const router = createCalendarRoutes(makeDeps());
    const res = await router.request("/api/me/calendars/connections", {
      method: "POST",
      body: JSON.stringify({ calendarId: "someone-else@example.test" }),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("unknown_calendar");
  });

  test("POST rejects an already-connected calendar, including via the primary alias", async () => {
    const router = createCalendarRoutes(makeDeps());
    // "primary" alias connection exists; connecting the real primary id is a dupe
    const res = await router.request("/api/me/calendars/connections", {
      method: "POST",
      body: JSON.stringify({ calendarId: "host@example.test" }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("already_connected");
  });

  test("POST creates the connection and enqueues the initial sync", async () => {
    const created: string[] = [];
    const synced: string[] = [];
    const router = createCalendarRoutes(
      makeDeps({
        createConnection: async (userId, externalCalendarId) => {
          created.push(`${userId}:${externalCalendarId}`);
          return connection({ id: OTHER_CONN_ID, userId, externalCalendarId });
        },
        enqueueSync: async (connectionId) => {
          synced.push(connectionId);
        },
      }),
    );
    const res = await router.request("/api/me/calendars/connections", {
      method: "POST",
      body: JSON.stringify({ calendarId: "team@group.calendar.google.com" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { connection: { id: string; calendarId: string } };
    expect(body.connection.id).toBe(OTHER_CONN_ID);
    expect(body.connection.calendarId).toBe("team@group.calendar.google.com");
    expect(created).toEqual([`${HOST_ID}:team@group.calendar.google.com`]);
    expect(synced).toEqual([OTHER_CONN_ID]);
  });

  test("DELETE 404s on non-uuid ids, unknown ids, and other users' connections", async () => {
    const deleted: string[] = [];
    const router = createCalendarRoutes(
      makeDeps({
        getConnection: async (id) =>
          id === CONN_ID ? connection({ userId: "99999999-9999-9999-9999-999999999999" }) : null,
        deleteConnection: async (id) => {
          deleted.push(id);
        },
      }),
    );
    for (const id of ["not-a-uuid", OTHER_CONN_ID, CONN_ID]) {
      const res = await router.request(`/api/me/calendars/connections/${id}`, { method: "DELETE" });
      expect(res.status).toBe(404);
    }
    expect(deleted).toEqual([]);
  });

  test("DELETE stops an established watch channel, then deletes", async () => {
    const stopped: string[] = [];
    const deleted: string[] = [];
    const router = createCalendarRoutes(
      makeDeps({
        getConnection: async () =>
          connection({ channelId: "chan-1", channelResourceId: "res-1" }),
        stopChannel: async ({ channelId, resourceId }) => {
          stopped.push(`${channelId}:${resourceId}`);
          return ok(undefined);
        },
        deleteConnection: async (id) => {
          deleted.push(id);
        },
      }),
    );
    const res = await router.request(`/api/me/calendars/connections/${CONN_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(stopped).toEqual(["chan-1:res-1"]);
    expect(deleted).toEqual([CONN_ID]);
  });

  test("DELETE is best-effort about the channel: a stop failure still deletes", async () => {
    const deleted: string[] = [];
    const router = createCalendarRoutes(
      makeDeps({
        getConnection: async () =>
          connection({ channelId: "chan-1", channelResourceId: "res-1" }),
        stopChannel: async () => { throw new Error("google down"); },
        deleteConnection: async (id) => {
          deleted.push(id);
        },
      }),
    );
    const res = await router.request(`/api/me/calendars/connections/${CONN_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(deleted).toEqual([CONN_ID]);
  });

  test("DELETE skips the channel stop when no watch was ever established", async () => {
    const stopped: string[] = [];
    const router = createCalendarRoutes(
      makeDeps({
        stopChannel: async (args) => {
          stopped.push(args.channelId);
          return ok(undefined);
        },
      }),
    );
    const res = await router.request(`/api/me/calendars/connections/${CONN_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(stopped).toEqual([]);
  });
});

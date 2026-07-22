import { err, ok, type Result } from "../lib/result";
import type { GoogleEvent } from "./busy-mapping";

// Thin fetch wrapper over Google Calendar REST. No googleapis dependency:
// the three endpoints v1 needs (calendarList, freeBusy, events) do not
// justify the monolith. Tokens come from BetterAuth's account store via
// auth.api.getAccessToken; this module never sees a refresh token.

export type GoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
};

export type GoogleApiError = {
  kind: "http_error" | "network_error" | "sync_token_expired";
  status?: number;
  message: string;
};

export type EventsPage = {
  items: GoogleEvent[];
  timeZone?: string; // calendar default zone, anchors all-day events
  nextPageToken?: string;
  nextSyncToken?: string;
};

export type ListEventsArgs = {
  accessToken: string;
  calendarId: string;
  // either syncToken (incremental) or timeMin/timeMax (initial full sync);
  // Google rejects syncToken combined with timeMin/timeMax/orderBy/q
  syncToken?: string;
  timeMin?: string; // RFC3339
  timeMax?: string; // RFC3339
  pageToken?: string;
};

export type WatchResult = {
  resourceId: string;
  expiration: Date;
};

const BASE = "https://www.googleapis.com/calendar/v3";

export async function listCalendars(
  accessToken: string,
): Promise<Result<GoogleCalendar[], GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  if (!res.ok) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `calendarList returned ${res.status}`,
    });
  }
  const body = (await res.json()) as {
    items?: { id: string; summary?: string; primary?: boolean; accessRole?: string }[];
  };
  return ok(
    (body.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary ?? "",
      primary: item.primary ?? false,
      accessRole: item.accessRole ?? "reader",
    })),
  );
}

// One page of events.list. singleEvents=true has Google expand recurrences;
// it is syncToken-compatible and must stay identical between the initial
// full sync and every incremental request. 410 means the sync token was
// invalidated server-side: surface it as sync_token_expired so the engine
// can wipe and full-resync.
export async function listEvents(
  args: ListEventsArgs,
): Promise<Result<EventsPage, GoogleApiError>> {
  const params = new URLSearchParams({
    singleEvents: "true",
    maxResults: "250",
  });
  if (args.syncToken) {
    params.set("syncToken", args.syncToken);
  } else {
    if (args.timeMin) params.set("timeMin", args.timeMin);
    if (args.timeMax) params.set("timeMax", args.timeMax);
  }
  if (args.pageToken) params.set("pageToken", args.pageToken);

  let res: Response;
  try {
    res = await fetch(
      `${BASE}/calendars/${encodeURIComponent(args.calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${args.accessToken}` } },
    );
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  if (res.status === 410) {
    return err({ kind: "sync_token_expired", status: 410, message: "sync token invalidated" });
  }
  if (!res.ok) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `events.list returned ${res.status}`,
    });
  }
  const body = (await res.json()) as {
    items?: GoogleEvent[];
    timeZone?: string;
    nextPageToken?: string;
    nextSyncToken?: string;
  };
  return ok({
    items: body.items ?? [],
    timeZone: body.timeZone,
    nextPageToken: body.nextPageToken,
    nextSyncToken: body.nextSyncToken,
  });
}

// Push notification channel on a calendar's events collection. Google POSTs
// to `address` on every change with our channelId/token echoed in headers.
export async function watchEvents(args: {
  accessToken: string;
  calendarId: string;
  channelId: string;
  channelToken: string;
  address: string;
}): Promise<Result<WatchResult, GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/calendars/${encodeURIComponent(args.calendarId)}/events/watch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: args.channelId,
          type: "web_hook",
          address: args.address,
          token: args.channelToken,
        }),
      },
    );
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  if (!res.ok) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `events.watch returned ${res.status}`,
    });
  }
  const body = (await res.json()) as { resourceId?: string; expiration?: string };
  if (!body.resourceId || !body.expiration) {
    return err({ kind: "http_error", status: res.status, message: "watch response missing resourceId/expiration" });
  }
  return ok({ resourceId: body.resourceId, expiration: new Date(Number(body.expiration)) });
}

// Booking write-through (docs/ARCHITECTURE.md: the calendar.events scope
// exists for exactly this). sendUpdates=all makes Google send native invites
// to attendees, which Gmail renders — unlike a third-party iTIP REQUEST whose
// From does not match the ORGANIZER.

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startIso: string; // RFC3339 UTC
  endIso: string;
  attendees: { email: string; displayName?: string }[];
};

export async function insertEvent(args: {
  accessToken: string;
  calendarId: string;
  event: CalendarEventInput;
}): Promise<Result<{ eventId: string }, GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/calendars/${encodeURIComponent(args.calendarId)}/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          summary: args.event.summary,
          description: args.event.description,
          start: { dateTime: args.event.startIso },
          end: { dateTime: args.event.endIso },
          attendees: args.event.attendees,
        }),
      },
    );
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  if (!res.ok) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `events.insert returned ${res.status}`,
    });
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) {
    return err({ kind: "http_error", status: res.status, message: "events.insert response missing id" });
  }
  return ok({ eventId: body.id });
}

export async function patchEventTime(args: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  startIso: string;
  endIso: string;
}): Promise<Result<void, GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}?sendUpdates=all`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          start: { dateTime: args.startIso },
          end: { dateTime: args.endIso },
        }),
      },
    );
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  if (!res.ok) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `events.patch returned ${res.status}`,
    });
  }
  return ok(undefined);
}

export async function deleteEvent(args: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<Result<void, GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}?sendUpdates=all`,
      { method: "DELETE", headers: { Authorization: `Bearer ${args.accessToken}` } },
    );
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  // 404/410 = already gone; treat as deleted
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `events.delete returned ${res.status}`,
    });
  }
  return ok(undefined);
}

export async function stopChannel(args: {
  accessToken: string;
  channelId: string;
  resourceId: string;
}): Promise<Result<void, GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/channels/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: args.channelId, resourceId: args.resourceId }),
    });
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  // 404 = channel already gone; treat as stopped
  if (!res.ok && res.status !== 404) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `channels.stop returned ${res.status}`,
    });
  }
  return ok(undefined);
}

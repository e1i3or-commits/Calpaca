// Typed client for the Hono API. Shapes mirror the Zod contracts in
// src/api/routes/* — this is the same contract the MCP server and embeds
// consume, the booking UI gets no private endpoints.

export type RenderedInstant = {
  utc: string;
  invitee: string; // ISO with offset + [IANA] suffix in the requested zone
};

export type SlotDto = {
  start: RenderedInstant;
  end: RenderedInstant;
  score: number;
  localHourWarning: boolean;
};

export type AvailabilityResponse = {
  curated: SlotDto[];
  all: SlotDto[];
};

export type HoldResponse = {
  holdIds: string[];
  expiresAt: string;
};

export type BookingConfirmation = {
  bookingId: string;
  hostUserIds: string[];
  rescheduleToken: string;
  cancelToken: string;
  start: RenderedInstant;
  end: RenderedInstant;
  emailSuggestion?: string;
};

export type CalendarEntry = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  connected: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status}: ${code}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "unknown_error");
  }
  return res.json() as Promise<T>;
}

export function getAvailability(args: {
  eventTypeSlug: string;
  start: string;
  end: string;
  inviteeTimezone: string;
  hosts?: string[];
}): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    eventTypeSlug: args.eventTypeSlug,
    start: args.start,
    end: args.end,
    inviteeTimezone: args.inviteeTimezone,
  });
  for (const host of args.hosts ?? []) params.append("hosts", host);
  return request(`/availability?${params}`);
}

export function createHold(args: {
  eventTypeSlug: string;
  start: string;
  end: string;
  hosts?: string[];
}): Promise<HoldResponse> {
  return request("/holds", { method: "POST", body: JSON.stringify(args) });
}

export function confirmBooking(args: {
  eventTypeSlug: string;
  holdIds: string[];
  invitee: { email: string; name: string; timezone: string };
}): Promise<BookingConfirmation> {
  return request("/bookings", { method: "POST", body: JSON.stringify(args) });
}

export function getMyCalendars(): Promise<{ calendars: CalendarEntry[] }> {
  return request("/api/me/calendars");
}

export async function signInWithGoogle(callbackURL: string): Promise<string> {
  const { url } = await request<{ url: string }>("/api/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", callbackURL }),
  });
  return url;
}

export function signOut(): Promise<unknown> {
  return request("/api/auth/sign-out", { method: "POST", body: "{}" });
}

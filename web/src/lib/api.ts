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

export type AnswerIssue = { field: string; reason: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** field-level detail, present on invalid_answers responses */
    readonly issues?: AnswerIssue[],
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
    const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: AnswerIssue[] };
    throw new ApiError(res.status, body.error ?? "unknown_error", body.issues);
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
  routingAnswers?: RoutingAnswers;
}): Promise<BookingConfirmation> {
  return request("/bookings", { method: "POST", body: JSON.stringify(args) });
}

export type RescheduleContext = {
  bookingId: string;
  eventTypeSlug: string;
  durationMinutes: number;
  status: string;
  start: RenderedInstant;
  end: RenderedInstant;
  inviteeTimezone: string;
};

export function getRescheduleContext(bookingId: string, token: string): Promise<RescheduleContext> {
  return request(`/bookings/${bookingId}/reschedule-context?token=${encodeURIComponent(token)}`);
}

export function rescheduleBooking(args: {
  bookingId: string;
  rescheduleToken: string;
  start: string;
  end: string;
}): Promise<{ bookingId: string; start: RenderedInstant; end: RenderedInstant }> {
  return request(`/bookings/${args.bookingId}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ rescheduleToken: args.rescheduleToken, start: args.start, end: args.end }),
  });
}

export function cancelBooking(args: {
  bookingId: string;
  cancelToken: string;
  reason?: string;
}): Promise<{ bookingId: string; status: string }> {
  return request(`/bookings/${args.bookingId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancelToken: args.cancelToken, reason: args.reason }),
  });
}

export function getMyCalendars(): Promise<{ calendars: CalendarEntry[] }> {
  return request("/api/me/calendars");
}

// ---- dashboard admin surface (/api/me/*) ----

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

export type ScheduleRule = { dow: number; start: string; end: string };

export type Schedule = {
  id: string;
  userId: string;
  name: string;
  timezone: string;
  rules: ScheduleRule[];
};

export type ScheduleInput = Omit<Schedule, "id" | "userId">;

export type Team = { id: string; name: string; slug: string };

export type TeamMember = { userId: string; name: string; email: string; isAdmin: boolean };

export type EventTypeHost = {
  userId: string;
  role: "member" | "required" | "optional";
  weight: number;
};

export type AdminEventType = {
  id: string;
  ownerUserId: string | null;
  teamId: string | null;
  slug: string;
  title: string;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minimumNoticeMin: number;
  rollingWindowDays: number;
  mode: "solo" | "round_robin" | "group";
  scheduleId: string | null;
  hosts: (EventTypeHost & { name: string; email: string })[];
};

export type EventTypeInput = Omit<AdminEventType, "id" | "ownerUserId" | "hosts"> & {
  hosts: EventTypeHost[];
};

export function listUsers(): Promise<{ users: DirectoryUser[] }> {
  return request("/api/me/users");
}

export function listSchedules(): Promise<{ schedules: Schedule[] }> {
  return request("/api/me/schedules");
}

export function createSchedule(input: ScheduleInput): Promise<Schedule> {
  return request("/api/me/schedules", { method: "POST", body: JSON.stringify(input) });
}

export function updateSchedule(id: string, input: ScheduleInput): Promise<Schedule> {
  return request(`/api/me/schedules/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteSchedule(id: string): Promise<{ ok: true }> {
  return request(`/api/me/schedules/${id}`, { method: "DELETE" });
}

export function listTeams(): Promise<{ teams: Team[] }> {
  return request("/api/me/teams");
}

export function createTeam(input: { name: string; slug: string }): Promise<Team> {
  return request("/api/me/teams", { method: "POST", body: JSON.stringify(input) });
}

export function listTeamMembers(teamId: string): Promise<{ members: TeamMember[] }> {
  return request(`/api/me/teams/${teamId}/members`);
}

export function addTeamMember(teamId: string, userId: string): Promise<{ ok: true }> {
  return request(`/api/me/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function removeTeamMember(teamId: string, userId: string): Promise<{ ok: true }> {
  return request(`/api/me/teams/${teamId}/members/${userId}`, { method: "DELETE" });
}

export function listEventTypes(): Promise<{ eventTypes: AdminEventType[] }> {
  return request("/api/me/event-types");
}

export function createEventType(input: EventTypeInput): Promise<AdminEventType> {
  return request("/api/me/event-types", { method: "POST", body: JSON.stringify(input) });
}

export function updateEventType(id: string, input: EventTypeInput): Promise<AdminEventType> {
  return request(`/api/me/event-types/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteEventType(id: string): Promise<{ ok: true }> {
  return request(`/api/me/event-types/${id}`, { method: "DELETE" });
}

// ---- routing forms ----

export type RoutingAnswers = Record<string, string | string[]>;

export type RoutingFieldType = "text" | "email" | "select" | "multiselect";

export type RoutingField = {
  key: string;
  label: string;
  type: RoutingFieldType;
  required: boolean;
  options?: string[];
};

export type RoutingCondition =
  | { kind: "always" }
  | { kind: "eq"; field: string; value: string }
  | { kind: "ne"; field: string; value: string }
  | { kind: "contains"; field: string; value: string }
  | { kind: "in"; field: string; values: string[] }
  | { kind: "and"; all: RoutingCondition[] }
  | { kind: "or"; any: RoutingCondition[] }
  | { kind: "not"; not: RoutingCondition };

export type RoutingRule = {
  priority: number;
  condition: RoutingCondition;
  targetEventTypeId: string | null;
  targetHostUserId: string | null;
};

export type RoutingForm = {
  id: string;
  ownerUserId: string | null;
  teamId: string | null;
  slug: string;
  fields: RoutingField[];
  rules: (RoutingRule & { id: string })[];
};

export type RoutingFormInput = {
  slug: string;
  teamId: string | null;
  fields: RoutingField[];
  rules: RoutingRule[];
};

export type RoutingEvaluation =
  | { matched: false }
  | { matched: true; eventTypeSlug: string | null; hostUserId: string | null; answers: RoutingAnswers };

export function getRoutingForm(slug: string): Promise<{ slug: string; fields: RoutingField[] }> {
  return request(`/routing/${encodeURIComponent(slug)}`);
}

export function evaluateRouting(slug: string, answers: RoutingAnswers): Promise<RoutingEvaluation> {
  return request("/routing/evaluate", { method: "POST", body: JSON.stringify({ slug, answers }) });
}

export function listRoutingForms(): Promise<{ forms: RoutingForm[] }> {
  return request("/api/me/routing-forms");
}

export function createRoutingForm(input: RoutingFormInput): Promise<RoutingForm> {
  return request("/api/me/routing-forms", { method: "POST", body: JSON.stringify(input) });
}

export function updateRoutingForm(id: string, input: RoutingFormInput): Promise<RoutingForm> {
  return request(`/api/me/routing-forms/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteRoutingForm(id: string): Promise<{ ok: true }> {
  return request(`/api/me/routing-forms/${id}`, { method: "DELETE" });
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

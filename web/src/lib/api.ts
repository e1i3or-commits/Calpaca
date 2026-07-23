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
  mutual?: boolean;
};

export type AvailabilityResponse = {
  curated: SlotDto[];
  all: SlotDto[];
  quorum?: {
    missingHost: { id: string; name: string };
    slots: SlotDto[];
  };
  inviteeCalendar?: { connected: true; expiresAt: string };
};

export type PollChoice = "yes" | "if_needed" | "no";
export type MeetingPoll = {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  timezone: string;
  status: string;
  votingOpen: boolean;
  resultsVisibility: "live" | "after_response" | "aggregates" | "hidden";
  resultsRevealed: boolean;
  deadline: string | null;
  allowResponseEditing: boolean;
  participantLimit: number | null;
  participantLimitReached: boolean;
  reminder24Hours: boolean;
  reminder1Hour: boolean;
  finalizedOptionId: string | null;
  participantCount: number;
  options: {
    id: string;
    start: string;
    end: string;
    yes: number;
    ifNeeded: number;
    no: number;
    rank: number;
  }[];
  responses?: {
    id?: string;
    name: string;
    email?: string;
    finalizationStatus?: "none" | "pending" | "sent" | "failed";
    finalizationSentAt?: string | null;
    finalizationError?: string | null;
    votes: { optionId: string; choice: PollChoice }[];
  }[];
  invites?: {
    id: string;
    email: string;
    invitationSentAt: string | null;
    reminder24SentAt: string | null;
    reminder1SentAt: string | null;
    lastError: string | null;
    responded: boolean;
  }[];
};

export type EventTypeProfile = {
  teamName: string | null;
  hosts: { name: string; title?: string | null; image: string | null }[];
};

export type EventTypeMeta = {
  slug: string;
  title: string;
  description?: string;
  durationMinutes: number;
  theme: string;
  layout?: "focus" | "split" | "compact";
  logoUrl?: string;
  meetingFormats?: ("phone" | "google_meet")[];
  /** absent only from pre-profile servers */
  profile?: EventTypeProfile;
  selectableHosts?: {
    id: string;
    name: string;
    image: string | null;
    role: "required" | "optional";
  }[];
  inviteeCalendarOverlay?: boolean;
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
  connectionId: string | null;
  conflictEnabled: boolean;
  isWriteDestination: boolean;
  syncHealthy: boolean | null;
  lastSyncedAt: string | null;
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

export function getEventTypeMeta(slug: string, workspaceSlug?: string): Promise<EventTypeMeta> {
  const query = workspaceSlug
    ? `?workspaceSlug=${encodeURIComponent(workspaceSlug)}`
    : "";
  return request(`/event-types/${encodeURIComponent(slug)}${query}`);
}

export function getAvailability(args: {
  eventTypeSlug: string;
  start: string;
  end: string;
  inviteeTimezone: string;
  workspaceSlug?: string;
  hosts?: string[];
  optionalHosts?: string[];
  inviteeCalendarToken?: string;
}): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    eventTypeSlug: args.eventTypeSlug,
    start: args.start,
    end: args.end,
    inviteeTimezone: args.inviteeTimezone,
  });
  if (args.workspaceSlug) params.set("workspaceSlug", args.workspaceSlug);
  for (const host of args.hosts ?? []) params.append("hosts", host);
  if (args.optionalHosts) {
    params.set("overrideHostRoles", "true");
    for (const host of args.optionalHosts) params.append("optionalHosts", host);
  }
  return request(`/availability?${params}`, args.inviteeCalendarToken
    ? { headers: {
        "content-type": "application/json",
        "x-calpaca-invitee-calendar": args.inviteeCalendarToken,
      } }
    : undefined);
}

export function startInviteeCalendarConnection(
  returnPath: string,
  workspaceSlug?: string,
  pollPublicId?: string,
): Promise<{ authorizationUrl: string }> {
  return request("/invitee-calendar/connect", {
    method: "POST",
    body: JSON.stringify({ returnPath, workspaceSlug, pollPublicId }),
  });
}

export function getInviteeCalendarStatus(capability: string): Promise<{
  connected: boolean;
  expiresAt?: string;
}> {
  return request("/invitee-calendar/status", {
    headers: {
      "content-type": "application/json",
      "x-calpaca-invitee-calendar": capability,
    },
  });
}

export function disconnectInviteeCalendar(capability: string): Promise<{ connected: false }> {
  return request("/invitee-calendar/session", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-calpaca-invitee-calendar": capability,
    },
  });
}

export function listMeetingPolls(): Promise<{ polls: MeetingPoll[] }> {
  return request("/api/me/polls");
}

export function createMeetingPoll(input: {
  title: string;
  description?: string;
  timezone: string;
  resultsVisibility: "live" | "after_response" | "aggregates" | "hidden";
  deadline?: string;
  allowResponseEditing: boolean;
  participantLimit?: number;
  reminder24Hours: boolean;
  reminder1Hour: boolean;
  inviteeEmails: string[];
  options: { start: string; end: string }[];
}): Promise<MeetingPoll> {
  return request("/api/me/polls", { method: "POST", body: JSON.stringify(input) });
}

export function suggestMeetingPollTimes(input: {
  timezone: string;
  startDate: string;
  endDate: string;
  dailyStart: string;
  dailyEnd: string;
  durationMinutes: number;
  count: number;
}): Promise<{ suggestions: { start: string; end: string }[] }> {
  return request("/api/me/polls/suggestions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function finalizeMeetingPoll(id: string, optionId: string): Promise<MeetingPoll> {
  return request(`/api/me/polls/${id}/finalize`, {
    method: "POST",
    body: JSON.stringify({ optionId }),
  });
}

export function setMeetingPollOpenState(id: string, open: boolean): Promise<MeetingPoll> {
  return request(`/api/me/polls/${id}/state`, {
    method: "POST",
    body: JSON.stringify({ open }),
  });
}

export function resendPollFinalization(
  pollId: string,
  participantId: string,
): Promise<{ status: "pending" }> {
  return request(`/api/me/polls/${pollId}/participants/${participantId}/resend`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getPublicMeetingPoll(publicId: string, editToken?: string): Promise<MeetingPoll> {
  const query = editToken ? `?token=${encodeURIComponent(editToken)}` : "";
  return request(`/polls/${encodeURIComponent(publicId)}${query}`);
}

export function getMeetingPollResponse(publicId: string, token: string): Promise<{
  name: string;
  email: string;
  votes: { optionId: string; choice: PollChoice }[];
}> {
  return request(`/polls/${encodeURIComponent(publicId)}/response?token=${encodeURIComponent(token)}`);
}

export function assessMeetingPollCalendar(
  publicId: string,
  capability: string,
): Promise<{
  assessment: { optionId: string; choice: "yes" | "no" }[];
  expiresAt: string;
}> {
  return request(`/polls/${encodeURIComponent(publicId)}/calendar-assessment`, {
    headers: {
      "content-type": "application/json",
      "x-calpaca-invitee-calendar": capability,
    },
  });
}

export function saveMeetingPollVotes(input: {
  publicId: string;
  name: string;
  email: string;
  editToken?: string;
  votes: { optionId: string; choice: PollChoice }[];
}): Promise<{ editToken: string }> {
  const { publicId, ...body } = input;
  return request(`/polls/${encodeURIComponent(publicId)}/votes`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createHold(args: {
  eventTypeSlug: string;
  workspaceSlug?: string;
  start: string;
  end: string;
  hosts?: string[];
  optionalHosts?: string[];
}): Promise<HoldResponse> {
  return request("/holds", { method: "POST", body: JSON.stringify(args) });
}

export function confirmBooking(args: {
  eventTypeSlug: string;
  workspaceSlug?: string;
  holdIds: string[];
  invitee: { email: string; name: string; timezone: string; notes?: string };
  routingAnswers?: RoutingAnswers;
  hosts?: string[];
  meetingFormat: "phone" | "google_meet";
  inviteePhone?: string;
}): Promise<BookingConfirmation> {
  return request("/bookings", { method: "POST", body: JSON.stringify(args) });
}

export function suggestTimes(args: {
  eventTypeSlug: string;
  workspaceSlug?: string;
  invitee: { email: string; name: string; timezone: string };
  proposedSlots: { start: string; end: string }[];
  message?: string;
}): Promise<{ suggestionId: string }> {
  const { eventTypeSlug, ...body } = args;
  return request(`/event-types/${encodeURIComponent(eventTypeSlug)}/suggestions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type RescheduleContext = {
  bookingId: string;
  eventTypeSlug: string;
  durationMinutes: number;
  status: string;
  start: RenderedInstant;
  end: RenderedInstant;
  inviteeTimezone: string;
  theme: string;
  layout?: "focus" | "split" | "compact";
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

export function connectCalendar(calendarId: string): Promise<{ connection: { id: string; calendarId: string } }> {
  return request("/api/me/calendars/connections", {
    method: "POST",
    body: JSON.stringify({ calendarId }),
  });
}

export function disconnectCalendar(connectionId: string): Promise<{ ok: true }> {
  return request(`/api/me/calendars/connections/${encodeURIComponent(connectionId)}`, {
    method: "DELETE",
  });
}

export function updateCalendarConnection(
  connectionId: string,
  patch: { conflictEnabled?: boolean; isWriteDestination?: true },
): Promise<{ connection: {
  id: string;
  conflictEnabled: boolean;
  isWriteDestination: boolean;
} }> {
  return request(`/api/me/calendars/connections/${encodeURIComponent(connectionId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ---- dashboard admin surface (/api/me/*) ----

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

export type ScheduleRule = { dow: number; start: string; end: string };
export type ScheduleOverride = {
  startDate: string;
  endDate: string;
  kind: "available" | "unavailable";
  start?: string;
  end?: string;
  forwardToUserId?: string | null;
};

export type Schedule = {
  id: string;
  userId: string;
  name: string;
  timezone: string;
  rules: ScheduleRule[];
  overrides: ScheduleOverride[];
};

export type ScheduleInput = Omit<Schedule, "id" | "userId">;

export type Team = { id: string; name: string; slug: string };

export type TeamMember = { userId: string; name: string; email: string; isAdmin: boolean };

export type AppRole = "owner" | "admin" | "member";
export type ManagedUser = DirectoryUser & {
  role: AppRole;
  status: "active" | "inactive";
  createdAt: string;
};
export type UserInvitation = {
  id: string;
  email: string;
  role: AppRole;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
};
export type UserManagementDirectory = {
  actor: { id: string; role: AppRole };
  users: ManagedUser[];
  invitations: UserInvitation[];
};

export type UserProfile = {
  id: string;
  name: string;
  title?: string | null;
  email: string;
  timezone: string;
  image: string | null;
};

export type ApiTokenRecord = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type WorkspaceContext = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "business" | "self_hosted";
  role: AppRole;
  entitlements: {
    memberLimit: number | null;
    customDomains: boolean;
    whitelabel: boolean;
    inviteeCalendarOverlay: boolean;
    meetingPolls: boolean;
  };
};

export type WorkspaceDomain = {
  id: string;
  hostname: string;
  status: "pending" | "verified";
  isPrimary: boolean;
  createdAt: string;
};

export function getWorkspace(): Promise<{
  workspace: WorkspaceContext;
  domains: WorkspaceDomain[];
  deploymentMode: "hosted" | "self_hosted";
}> {
  return request("/api/me/workspace");
}

export function updateWorkspace(name: string): Promise<{
  workspace: { id: string; name: string };
}> {
  return request("/api/me/workspace", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function addWorkspaceDomain(hostname: string): Promise<{
  domain: WorkspaceDomain & {
    dnsRecord: { type: "TXT"; name: string; value: string };
  };
}> {
  return request("/api/me/workspace/domains", {
    method: "POST",
    body: JSON.stringify({ hostname }),
  });
}

export function removeWorkspaceDomain(id: string): Promise<{ ok: true }> {
  return request(`/api/me/workspace/domains/${id}`, { method: "DELETE" });
}

export function verifyWorkspaceDomain(id: string): Promise<{
  domain: Pick<WorkspaceDomain, "id" | "hostname" | "status" | "isPrimary">;
  provisioning: "provisioned" | "not_configured";
}> {
  return request(`/api/me/workspace/domains/${id}/verify`, { method: "POST" });
}

export function getProfile(): Promise<{ profile: UserProfile }> {
  return request("/api/me/profile");
}

export function updateProfile(input: {
  name: string;
  title: string | null;
  timezone: string;
  image: string | null;
}): Promise<{ profile: UserProfile }> {
  return request("/api/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listApiTokens(): Promise<{ tokens: ApiTokenRecord[] }> {
  return request("/api/me/api-tokens");
}

export function createApiToken(input: {
  name: string;
  expiresAt: string | null;
}): Promise<{ token: string; record: ApiTokenRecord }> {
  return request("/api/me/api-tokens", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeApiToken(id: string): Promise<{ ok: true }> {
  return request(`/api/me/api-tokens/${id}`, { method: "DELETE" });
}

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
  description?: string | null;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minimumNoticeMin: number;
  rollingWindowDays: number;
  mode: "solo" | "round_robin" | "group";
  scheduleId: string | null;
  theme: string;
  layout?: "focus" | "split" | "compact";
  logoUrl?: string | null;
  meetingFormats?: ("phone" | "google_meet")[];
  hosts: (EventTypeHost & { name: string; email: string })[];
};

export type EventTypeInput = Omit<AdminEventType, "id" | "ownerUserId" | "hosts"> & {
  hosts: EventTypeHost[];
};

export type PresentationOption = { value: string; label: string };

export function listPresentationOptions(): Promise<{
  themes: PresentationOption[];
  publicThemes: string[];
  layouts: PresentationOption[];
}> {
  return request("/api/me/theme-options");
}

export function listUsers(): Promise<{ users: DirectoryUser[] }> {
  return request("/api/me/users");
}

export function getUserManagement(): Promise<UserManagementDirectory> {
  return request("/api/me/user-management");
}

export function inviteUser(input: { email: string; role: AppRole }): Promise<{
  invitation: UserInvitation;
  delivery: "sent" | "not_configured" | "failed" | "existing_user";
}> {
  return request("/api/me/user-management/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateManagedUser(
  id: string,
  patch: Partial<Pick<ManagedUser, "role" | "status">>,
): Promise<{ user: ManagedUser }> {
  return request(`/api/me/user-management/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function revokeUserInvitation(id: string): Promise<{ ok: true }> {
  return request(`/api/me/user-management/invitations/${id}`, { method: "DELETE" });
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

export function updateTeamMemberRole(
  teamId: string,
  userId: string,
  isAdmin: boolean,
): Promise<{ ok: true }> {
  return request(`/api/me/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ isAdmin }),
  });
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

// ---- organizer bookings ----

export type AdminBooking = {
  id: string;
  eventType: { slug: string; title: string };
  start: RenderedInstant;
  end: RenderedInstant;
  inviteeName: string;
  inviteeEmail: string;
  hostUserIds: string[];
  status: "confirmed" | "cancelled" | "no_show";
  inviteStatus: "none" | "sent" | "delivered" | "failed";
};

export type AdminBookingDetail = AdminBooking & {
  inviteeTimezone: string;
  inviteeNotes: string | null;
  meetingFormat: "phone" | "google_meet" | null;
  inviteePhone: string | null;
  routingAnswers: RoutingAnswers | null;
  hasGoogleEvent: boolean;
  events: {
    kind: string;
    payload: unknown;
    createdAt: string;
  }[];
};

export type AssignmentExplanation = {
  winnerUserId: string;
  reason:
    | "only_available_candidate"
    | "lowest_effective_load"
    | "least_recently_booked"
    | "stable_user_id_tiebreak";
  candidates: {
    userId: string;
    bookingCount: number;
    effectiveLoad: number;
    lastBookedAt: string | null;
  }[];
};

export function listAdminBookings(args: {
  filter: "upcoming" | "past";
  status?: AdminBooking["status"];
  page?: number;
  pageSize?: number;
  timezone: string;
}): Promise<{ bookings: AdminBooking[]; page: number; pageSize: number; total: number }> {
  const params = new URLSearchParams({
    filter: args.filter,
    page: String(args.page ?? 1),
    pageSize: String(args.pageSize ?? 50),
    timezone: args.timezone,
  });
  if (args.status) params.set("status", args.status);
  return request(`/api/me/bookings?${params}`);
}

export function getAdminBooking(id: string, timezone: string): Promise<AdminBookingDetail> {
  return request(`/api/me/bookings/${encodeURIComponent(id)}?timezone=${encodeURIComponent(timezone)}`);
}

export function getBookingAssignment(id: string): Promise<{ assignment: AssignmentExplanation }> {
  return request(`/api/me/bookings/${encodeURIComponent(id)}/assignment`);
}

export function markBookingNoShow(id: string): Promise<{ bookingId: string; status: string }> {
  return request(`/api/me/bookings/${encodeURIComponent(id)}/no-show`, {
    method: "POST",
    body: "{}",
  });
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

export function getRoutingForm(
  slug: string,
  workspaceSlug?: string,
): Promise<{ slug: string; fields: RoutingField[] }> {
  const query = workspaceSlug
    ? `?workspaceSlug=${encodeURIComponent(workspaceSlug)}`
    : "";
  return request(`/routing/${encodeURIComponent(slug)}${query}`);
}

export function evaluateRouting(
  slug: string,
  answers: RoutingAnswers,
  workspaceSlug?: string,
): Promise<RoutingEvaluation> {
  return request("/routing/evaluate", {
    method: "POST",
    body: JSON.stringify({ slug, answers, ...(workspaceSlug ? { workspaceSlug } : {}) }),
  });
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

export type AnalyticsReport = {
  outcomes: {
    eventTypeSlug: string;
    month: string;
    status: "confirmed" | "cancelled" | "no_show";
    count: number;
  }[];
  leadTime: {
    eventTypeSlug: string;
    bookingCount: number;
    averageHours: number;
    medianHours: number;
  }[];
  noShowRates: {
    eventTypeSlug: string;
    completedCount: number;
    noShowCount: number;
    noShowRate: number;
  }[];
  roundRobin: {
    eventTypeSlug: string;
    hostName: string;
    hostEmail: string;
    weight: number;
    bookingCount: number;
    bookingShare: number;
    weightShare: number;
  }[];
};

export function getAnalytics(from: string, to: string): Promise<AnalyticsReport> {
  return request(`/api/me/analytics?${new URLSearchParams({ from, to })}`);
}

export function analyticsCsvUrl(from: string, to: string): string {
  return `/api/me/analytics.csv?${new URLSearchParams({ from, to })}`;
}

import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb,
  pgEnum, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import type { BookingAnswers, BookingQuestion } from "../core/booking/questions";
import type { BookingLocation, EventLocation } from "../core/booking/locations";
import { sql } from "drizzle-orm";

export const bookingEventKind = pgEnum("booking_event_kind", [
  "created", "rescheduled", "cancelled", "reassigned",
  "no_show", "invite_sent", "invite_delivered", "invite_failed",
  "reminder_sent",
]);
export const assignmentMode = pgEnum("assignment_mode", [
  "solo", "round_robin", "group",
]);
export const hostRole = pgEnum("host_role", [
  "member",          // round robin pool member
  "required",        // group booking: must be free
  "optional",        // group booking: scored, not required
]);
export const holdStatus = pgEnum("hold_status", [
  "active", "confirmed", "expired", "released",
]);
export const appRole = pgEnum("app_role", ["owner", "admin", "member"]);
export const userStatus = pgEnum("user_status", ["active", "inactive"]);
export const invitationStatus = pgEnum("invitation_status", [
  "pending", "accepted", "revoked",
]);
export const workspacePlan = pgEnum("workspace_plan", [
  "free", "pro", "business", "self_hosted",
]);
export const domainStatus = pgEnum("domain_status", [
  "pending", "verified",
]);

// Doubles as BetterAuth's user model (drizzleAdapter usePlural maps user ->
// users). BetterAuth requires emailVerified/image/updatedAt; timezone and
// prefs are app-owned and never pass through the auth layer.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").notNull().default("UTC"), // IANA
  appRole: appRole("app_role").notNull().default("member"),
  status: userStatus("status").notNull().default("active"),
  // scoring preferences
  prefs: jsonb("prefs").$type<{
    morningWeight?: number;       // 0..1, default 1
    adjacencyBonus?: boolean;     // default true
    focusBlocks?: { dow: number; start: string; end: string }[];
  }>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: workspacePlan("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: appRole("role").notNull().default("member"),
  status: userStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  index("workspace_member_user_idx").on(t.userId),
]);

export const workspaceDomains = pgTable("workspace_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  status: domainStatus("status").notNull().default("pending"),
  verificationToken: text("verification_token").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("workspace_domain_workspace_idx").on(t.workspaceId)]);

export const userInvitations = pgTable("user_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: appRole("role").notNull().default("member"),
  status: invitationStatus("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pending_user_invitation_email_uq").on(t.email)
    .where(sql`status = 'pending'`),
]);

// BetterAuth-managed tables. uuid ids (not BetterAuth's default text ids)
// via advanced.database.generateId = crypto.randomUUID in src/auth.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("api_token_user_idx").on(t.userId)]);

// Anonymous invitees may briefly connect Google Calendar while choosing a
// time. Only opaque token hashes and free/busy ranges are retained; Google
// credentials and event details never enter this table.
export const inviteeCalendarSessions = pgTable("invitee_calendar_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  stateHash: text("state_hash").notNull().unique(),
  capabilityHash: text("capability_hash").unique(),
  returnUrl: text("return_url").notNull(),
  status: text("status").notNull().default("pending"),
  busy: jsonb("busy").$type<{ start: string; end: string }[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invitee_calendar_expiry_idx").on(t.expiresAt),
]);

// accounts is the OAuth token store: Google access/refresh tokens live here
// and nowhere else. The sync worker reads them via auth.api.getAccessToken,
// which refreshes expired tokens itself.
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),   // provider-side user id
  providerId: text("provider_id").notNull(), // "google"
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"), // unused (no credential auth); BetterAuth expects the column
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
}, (t) => [uniqueIndex("team_workspace_slug_uq").on(t.workspaceId, t.slug)]);

export const teamMembers = pgTable("team_members", {
  teamId: uuid("team_id").notNull().references(() => teams.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  isAdmin: boolean("is_admin").notNull().default(false),
}, (t) => [uniqueIndex("team_member_uq").on(t.teamId, t.userId)]);

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull().default("google"),
  externalCalendarId: text("external_calendar_id").notNull(),
  conflictEnabled: boolean("conflict_enabled").notNull().default(true),
  isWriteDestination: boolean("is_write_destination").notNull().default(false),
  // watch channel lifecycle: channelToken authenticates inbound webhook
  // pushes (x-goog-channel-token), channelResourceId is required to stop
  // a channel. Both null until a watch is established.
  channelId: text("channel_id"),
  channelResourceId: text("channel_resource_id"),
  channelToken: text("channel_token"),
  channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),
  syncToken: text("sync_token"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  // full syncs bound their window with timeMax (unbounded + singleEvents
  // would expand recurring events forever); the sync token freezes that
  // window, so the sweep re-baselines with a fresh full sync when this ages
  fullSyncedAt: timestamp("full_synced_at", { withTimezone: true }),
  syncHealthy: boolean("sync_healthy").notNull().default(true),
}, (t) => [
  index("cal_conn_user_idx").on(t.userId),
  uniqueIndex("calendar_write_destination_uq").on(t.userId)
    .where(sql`is_write_destination = true`),
]);

export const calendarBusyCache = pgTable("calendar_busy_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull()
    .references(() => calendarConnections.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  externalEventId: text("external_event_id"),
}, (t) => [
  index("busy_window_idx").on(t.connectionId, t.startsAt, t.endsAt),
  // incremental sync upserts by event id; rows without one (freeBusy blobs)
  // are only ever bulk-replaced
  uniqueIndex("busy_event_uq").on(t.connectionId, t.externalEventId)
    .where(sql`external_event_id is not null`),
]);

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull().default("Working hours"),
  timezone: text("timezone").notNull(), // rules expand in this zone
  // [{ dow: 1, start: "09:00", end: "17:00" }, ...]
  rules: jsonb("rules").$type<{ dow: number; start: string; end: string }[]>()
    .notNull(),
  overrides: jsonb("overrides").$type<{
    startDate: string;
    endDate: string;
    kind: "available" | "unavailable";
    start?: string;
    end?: string;
    forwardToUserId?: string | null;
  }[]>().notNull().default([]),
});

export const eventTypes = pgTable("event_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().default(sql`NULL`).references(() => workspaces.id),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  teamId: uuid("team_id").references(() => teams.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull(),
  selectableDurations: jsonb("selectable_durations").$type<number[]>().notNull().default([]),
  capacity: integer("capacity").notNull().default(1),
  bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  minimumNoticeMin: integer("minimum_notice_min").notNull().default(240),
  rollingWindowDays: integer("rolling_window_days").notNull().default(14),
  maxPerDay: integer("max_per_day"),
  mode: assignmentMode("mode").notNull().default("solo"),
  scheduleId: uuid("schedule_id").references(() => schedules.id),
  curatedSlotCount: integer("curated_slot_count").notNull().default(3),
  // bundled theme name (src/core/theming/themes.ts); public pages render with it
  theme: text("theme").notNull().default("default"),
  layout: text("layout").notNull().default("focus"),
  logoUrl: text("logo_url"),
  meetingFormats: jsonb("meeting_formats").$type<("phone" | "google_meet")[]>()
    .notNull().default(["google_meet"]),
  bookingQuestions: jsonb("booking_questions").$type<BookingQuestion[]>()
    .notNull().default([]),
  locations: jsonb("locations").$type<EventLocation[]>().notNull().default([]),
  // group booking on public links: explicit allowlist, empty = auth-only
  publicSelectableHostIds: jsonb("public_selectable_host_ids")
    .$type<string[]>().notNull().default([]),
  agentPolicy: jsonb("agent_policy").$type<{
    enabled: boolean; autoExpireHoldsMin?: number;
  }>().notNull().default({ enabled: false }),
}, (t) => [
  uniqueIndex("event_type_workspace_slug_uq").on(t.workspaceId, t.slug),
]);

export const bookingPages = pgTable("booking_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  theme: text("theme").notNull().default("default"),
  logoUrl: text("logo_url"),
  eventTypeIds: jsonb("event_type_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("booking_page_workspace_slug_uq").on(t.workspaceId, t.slug),
]);

export const eventTypeHosts = pgTable("event_type_hosts", {
  eventTypeId: uuid("event_type_id").notNull().references(() => eventTypes.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: hostRole("role").notNull().default("member"),
  weight: integer("weight").notNull().default(100), // round robin weighting
}, (t) => [uniqueIndex("eth_uq").on(t.eventTypeId, t.userId)]);

export const holds = pgTable("holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventTypeId: uuid("event_type_id").notNull().references(() => eventTypes.id),
  hostUserId: uuid("host_user_id").notNull().references(() => users.id),
  slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
  slotEnd: timestamp("slot_end", { withTimezone: true }).notNull(),
  status: holdStatus("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("active_hold_slot_idx").on(t.eventTypeId, t.slotStart)
    .where(sql`status = 'active'`),
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().default(sql`NULL`).references(() => workspaces.id),
  eventTypeId: uuid("event_type_id").notNull().references(() => eventTypes.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  inviteeEmail: text("invitee_email").notNull(),
  inviteeName: text("invitee_name").notNull(),
  inviteeTimezone: text("invitee_timezone").notNull(),
  // free-text "anything that will help prepare" from the booking form;
  // surfaces in the invite email, the ICS, and the Google event description
  inviteeNotes: text("invitee_notes"),
  meetingFormat: text("meeting_format"),
  inviteePhone: text("invitee_phone"),
  // all hosts on the meeting; solo/rr have one, group has many
  hostUserIds: jsonb("host_user_ids").$type<string[]>().notNull(),
  status: text("status").notNull().default("confirmed"), // projection only
  inviteStatus: text("invite_status").notNull().default("none"), // projection only
  rescheduleToken: text("reschedule_token").notNull(),
  cancelToken: text("cancel_token").notNull(),
  routingAnswers: jsonb("routing_answers"),
  bookingAnswers: jsonb("booking_answers").$type<BookingAnswers>().notNull().default({}),
  bookingLocation: jsonb("booking_location").$type<BookingLocation>(),
  // set once the booking is written to the organizer host's Google calendar;
  // null means the ICS email is the only calendar artifact (fallback path)
  googleEventId: text("google_event_id"),
}, (t) => [index("bookings_time_idx").on(t.startsAt)]);

export const bookingEvents = pgTable("booking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  kind: bookingEventKind("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // append-only: no update/delete grants in migration; enforced by role
}, (t) => [index("booking_events_idx").on(t.bookingId, t.createdAt)]);

export const routingForms = pgTable("routing_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().default(sql`NULL`).references(() => workspaces.id),
  // owner-or-team scoping, same shape as eventTypes
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  teamId: uuid("team_id").references(() => teams.id),
  slug: text("slug").notNull(),
  fields: jsonb("fields").notNull(), // form definition
}, (t) => [
  uniqueIndex("routing_form_workspace_slug_uq").on(t.workspaceId, t.slug),
]);

export const routingRules = pgTable("routing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => routingForms.id),
  priority: integer("priority").notNull(),
  // condition AST evaluated by pure function in core
  condition: jsonb("condition").notNull(),
  targetEventTypeId: uuid("target_event_type_id").references(() => eventTypes.id),
  targetHostUserId: uuid("target_host_user_id").references(() => users.id),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().default(sql`NULL`).references(() => workspaces.id),
  teamId: uuid("team_id").references(() => teams.id),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull(), // kinds subscribed
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastHttpStatus: integer("last_http_status"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("webhook_deliveries_webhook_created_idx").on(t.webhookId, t.createdAt),
]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
}, (t) => [
  primaryKey({ columns: [t.key, t.bucketStart] }),
]);

export const timeSuggestions = pgTable("time_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventTypeId: uuid("event_type_id").notNull().references(() => eventTypes.id),
  inviteeEmail: text("invitee_email").notNull(),
  inviteeName: text("invitee_name").notNull(),
  inviteeTimezone: text("invitee_timezone").notNull(),
  proposedSlots: jsonb("proposed_slots").$type<{ start: string; end: string }[]>().notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetingPolls = pgTable("meeting_polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  timezone: text("timezone").notNull(),
  status: text("status").notNull().default("open"),
  resultsVisibility: text("results_visibility").notNull().default("after_response"),
  deadline: timestamp("deadline", { withTimezone: true }),
  allowResponseEditing: boolean("allow_response_editing").notNull().default(true),
  participantLimit: integer("participant_limit"),
  reminder24Hours: boolean("reminder_24_hours").notNull().default(false),
  reminder1Hour: boolean("reminder_1_hour").notNull().default(false),
  finalizedOptionId: uuid("finalized_option_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("meeting_poll_workspace_idx").on(t.workspaceId, t.createdAt),
]);

export const meetingPollOptions = pgTable("meeting_poll_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  pollId: uuid("poll_id").notNull()
    .references(() => meetingPolls.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
}, (t) => [index("meeting_poll_option_poll_idx").on(t.pollId)]);

export const meetingPollParticipants = pgTable("meeting_poll_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  pollId: uuid("poll_id").notNull()
    .references(() => meetingPolls.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  editTokenHash: text("edit_token_hash").notNull().unique(),
  finalizationStatus: text("finalization_status").notNull().default("none"),
  finalizationSentAt: timestamp("finalization_sent_at", { withTimezone: true }),
  finalizationError: text("finalization_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("meeting_poll_participant_email_uq").on(t.pollId, t.email),
]);

export const meetingPollVotes = pgTable("meeting_poll_votes", {
  participantId: uuid("participant_id").notNull()
    .references(() => meetingPollParticipants.id, { onDelete: "cascade" }),
  optionId: uuid("option_id").notNull()
    .references(() => meetingPollOptions.id, { onDelete: "cascade" }),
  choice: text("choice").notNull(),
}, (t) => [
  primaryKey({ columns: [t.participantId, t.optionId] }),
  index("meeting_poll_vote_option_idx").on(t.optionId),
]);

export const meetingPollInvites = pgTable("meeting_poll_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  pollId: uuid("poll_id").notNull()
    .references(() => meetingPolls.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  invitationSentAt: timestamp("invitation_sent_at", { withTimezone: true }),
  reminder24SentAt: timestamp("reminder_24_sent_at", { withTimezone: true }),
  reminder1SentAt: timestamp("reminder_1_sent_at", { withTimezone: true }),
  lastError: text("last_error"),
}, (t) => [
  uniqueIndex("meeting_poll_invite_email_uq").on(t.pollId, t.email),
  index("meeting_poll_invite_poll_idx").on(t.pollId),
]);

export const signupSheets = pgTable("signup_sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  timezone: text("timezone").notNull(),
  status: text("status").notNull().default("open"),
  rosterVisibility: text("roster_visibility").notNull().default("counts"),
  maxRegistrationsPerPerson: integer("max_registrations_per_person").notNull().default(1),
  questions: jsonb("questions").$type<{
    id: string;
    label: string;
    required: boolean;
  }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("signup_sheet_workspace_idx").on(t.workspaceId, t.createdAt)]);

export const signupSessions = pgTable("signup_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sheetId: uuid("sheet_id").notNull()
    .references(() => signupSheets.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
}, (t) => [index("signup_session_sheet_idx").on(t.sheetId, t.startsAt)]);

export const signupRegistrations = pgTable("signup_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sheetId: uuid("sheet_id").notNull()
    .references(() => signupSheets.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull()
    .references(() => signupSessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
  cancelToken: text("cancel_token").notNull(),
  status: text("status").notNull().default("active"),
  confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
  confirmationError: text("confirmation_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("signup_registration_session_email_uq").on(t.sessionId, t.email)
    .where(sql`status = 'active'`),
  index("signup_registration_sheet_idx").on(t.sheetId, t.createdAt),
  index("signup_registration_cancel_idx").on(t.cancelToken),
]);

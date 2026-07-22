# Schema Draft (Drizzle)

Design notes first, then the draft. This is a starting point for task 04, not
final. BetterAuth manages its own auth tables; pg-boss manages its own queue
tables; neither is duplicated here.

Notes:
- `booking_events` is append-only and is the source of truth. `bookings` is a
  maintained projection for query convenience. Triggers or application code
  keep the projection in sync; the event log wins on conflict.
- All timestamps are `timestamptz` stored in UTC. Timezone columns hold IANA
  names and are used only for rendering and rule expansion.
- `holds` enforces the no-double-booking guarantee: unique partial index on
  (host_id, slot_start) where active, taken FOR UPDATE at confirmation.
- `event_type_hosts.mode` distinguishes round robin membership from group
  booking required/optional roles on the same join table.

```ts
// src/db/schema.ts
import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb,
  pgEnum, uniqueIndex, index,
} from "drizzle-orm/pg-core";

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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"), // IANA
  // scoring preferences
  prefs: jsonb("prefs").$type<{
    morningWeight?: number;       // 0..1, default 1
    adjacencyBonus?: boolean;     // default true
    focusBlocks?: { dow: number; start: string; end: string }[];
  }>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

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
  // watch channel lifecycle
  channelId: text("channel_id"),
  channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),
  syncToken: text("sync_token"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncHealthy: boolean("sync_healthy").notNull().default(true),
}, (t) => [index("cal_conn_user_idx").on(t.userId)]);

export const calendarBusyCache = pgTable("calendar_busy_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull()
    .references(() => calendarConnections.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  externalEventId: text("external_event_id"),
}, (t) => [index("busy_window_idx").on(t.connectionId, t.startsAt, t.endsAt)]);

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull().default("Working hours"),
  timezone: text("timezone").notNull(), // rules expand in this zone
  // [{ dow: 1, start: "09:00", end: "17:00" }, ...]
  rules: jsonb("rules").$type<{ dow: number; start: string; end: string }[]>()
    .notNull(),
});

export const eventTypes = pgTable("event_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  teamId: uuid("team_id").references(() => teams.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  minimumNoticeMin: integer("minimum_notice_min").notNull().default(240),
  rollingWindowDays: integer("rolling_window_days").notNull().default(14),
  maxPerDay: integer("max_per_day"),
  mode: assignmentMode("mode").notNull().default("solo"),
  scheduleId: uuid("schedule_id").references(() => schedules.id),
  curatedSlotCount: integer("curated_slot_count").notNull().default(3),
  // group booking on public links: explicit allowlist, empty = auth-only
  publicSelectableHostIds: jsonb("public_selectable_host_ids")
    .$type<string[]>().notNull().default([]),
  agentPolicy: jsonb("agent_policy").$type<{
    enabled: boolean; autoExpireHoldsMin?: number;
  }>().notNull().default({ enabled: false }),
}, (t) => [uniqueIndex("event_type_slug_uq").on(t.ownerUserId, t.teamId, t.slug)]);

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
  // one active hold per host per slot start; group bookings create one per host
  uniqueIndex("active_hold_uq").on(t.hostUserId, t.slotStart)
    .where(sql`status = 'active'`),
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventTypeId: uuid("event_type_id").notNull().references(() => eventTypes.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  inviteeEmail: text("invitee_email").notNull(),
  inviteeName: text("invitee_name").notNull(),
  inviteeTimezone: text("invitee_timezone").notNull(),
  // all hosts on the meeting; solo/rr have one, group has many
  hostUserIds: jsonb("host_user_ids").$type<string[]>().notNull(),
  status: text("status").notNull().default("confirmed"), // projection only
  inviteStatus: text("invite_status").notNull().default("none"), // projection only
  rescheduleToken: text("reschedule_token").notNull(),
  cancelToken: text("cancel_token").notNull(),
  routingAnswers: jsonb("routing_answers"),
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
  teamId: uuid("team_id").references(() => teams.id),
  slug: text("slug").notNull().unique(),
  fields: jsonb("fields").notNull(), // form definition
});

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
  teamId: uuid("team_id").references(() => teams.id),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull(), // kinds subscribed
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
});
```

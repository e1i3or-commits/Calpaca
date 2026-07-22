import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { timingSafeEqual } from "node:crypto";
import {
  getEventTypeForBooking as dbGetEventTypeForBooking,
  getEventTypeForBookingById as dbGetEventTypeForBookingById,
  getEventTypeHosts as dbGetEventTypeHosts,
  getSchedulesForUsers as dbGetSchedulesForUsers,
  getBusyForUsers as dbGetBusyForUsers,
  type BookingEventTypeConfig,
  type EventTypeHostRecord,
  type HostSchedule,
  type HostBusy,
} from "../../db/availability-repo";
import {
  createHold as dbCreateHold,
  confirmHold as dbConfirmHold,
  confirmReschedule as dbConfirmReschedule,
  type Slot,
  type HoldRecord,
  type Invitee,
  type CreateHoldError,
  type ConfirmHoldError,
  type ConfirmedBooking,
  type RoundRobinAssignment,
} from "../../db/holds-repo";
import {
  getBookingById as dbGetBookingById,
  getBookingHistoryForHosts as dbGetBookingHistoryForHosts,
  appendEvent,
  type BookingRow,
} from "../../db/booking-repo";
import { expandRules } from "../../core/availability/rules";
import { subtract, type Interval } from "../../core/availability/intervals";
import type { AssignmentCandidate, BookingRecord } from "../../core/assignment/round-robin";
import type { BookingState, BookingStateError } from "../../core/booking/state";
import type { RoutingAnswers } from "../../core/routing/condition";
import { ok, type Result } from "../../lib/result";
import { suggestEmailDomain } from "../../lib/email-typo";
import { resolveTheme } from "../../core/theming/themes";
import { enqueueInviteEmail as jobsEnqueueInviteEmail, emitBookingWebhook as jobsEmitBookingWebhook } from "../../jobs/index";

/** Same "inject repo functions, not module bindings" convention as
 * src/api/routes/availability.ts (task 13), so tests can stub every
 * dependency including the database-transaction-shaped ones (createHold,
 * confirmHold, confirmReschedule, cancelBooking) without a real Postgres. */
export interface BookingDeps {
  readonly getEventTypeForBooking: (slug: string) => Promise<BookingEventTypeConfig | null>;
  readonly getEventTypeForBookingById: (id: string) => Promise<BookingEventTypeConfig | null>;
  readonly getEventTypeHosts: (eventTypeId: string) => Promise<EventTypeHostRecord[]>;
  readonly getSchedulesForUsers: (userIds: readonly string[]) => Promise<HostSchedule[]>;
  readonly getBusyForUsers: (userIds: readonly string[], window: Interval) => Promise<HostBusy[]>;
  readonly createHold: (
    eventTypeId: string,
    hostUserIds: readonly string[],
    slot: Slot,
    ttl: Temporal.Duration,
  ) => Promise<Result<readonly HoldRecord[], CreateHoldError>>;
  readonly confirmHold: (
    holdIds: readonly string[],
    invitee: Invitee,
    assignment?: RoundRobinAssignment,
    routingAnswers?: RoutingAnswers,
  ) => Promise<Result<ConfirmedBooking, ConfirmHoldError>>;
  readonly confirmReschedule: (
    bookingId: string,
    holdIds: readonly string[],
  ) => Promise<Result<BookingState, ConfirmHoldError | BookingStateError>>;
  readonly cancelBooking: (
    bookingId: string,
    reason: string | undefined,
  ) => Promise<Result<BookingState, BookingStateError>>;
  readonly getBookingById: (id: string) => Promise<BookingRow | null>;
  readonly getBookingHistoryForHosts: (hostUserIds: readonly string[]) => Promise<readonly BookingRecord[]>;
  readonly now: () => Temporal.Instant;
  /** Optional so existing dep fixtures keep compiling; the default wires the
   * pg-boss invite-email queue. Must never throw into the response path. */
  readonly enqueueInviteEmail?: (bookingId: string, kind: "created" | "rescheduled" | "cancelled") => Promise<void>;
  /** Same optional contract: the default enqueues the webhook fan-out job. */
  readonly emitBookingWebhook?: (
    bookingId: string,
    kind: "created" | "rescheduled" | "cancelled",
    opts?: { reason?: string },
  ) => Promise<void>;
}

const defaultDeps: BookingDeps = {
  getEventTypeForBooking: (slug) => dbGetEventTypeForBooking(slug),
  getEventTypeForBookingById: (id) => dbGetEventTypeForBookingById(id),
  getEventTypeHosts: (eventTypeId) => dbGetEventTypeHosts(eventTypeId),
  getSchedulesForUsers: (userIds) => dbGetSchedulesForUsers(userIds),
  getBusyForUsers: (userIds, window) => dbGetBusyForUsers(userIds, window),
  createHold: (eventTypeId, hostUserIds, slot, ttl) => dbCreateHold(eventTypeId, hostUserIds, slot, ttl),
  confirmHold: (holdIds, invitee, assignment, routingAnswers) =>
    dbConfirmHold(holdIds, invitee, undefined, assignment, routingAnswers),
  confirmReschedule: (bookingId, holdIds) => dbConfirmReschedule(bookingId, holdIds),
  cancelBooking: async (bookingId, reason) => {
    const result = await appendEvent(bookingId, "cancelled", { reason });
    return result.ok ? ok(result.value) : result;
  },
  getBookingById: (id) => dbGetBookingById(id),
  getBookingHistoryForHosts: (hostUserIds) => dbGetBookingHistoryForHosts(hostUserIds),
  now: () => Temporal.Now.instant(),
  enqueueInviteEmail: (bookingId, kind) => jobsEnqueueInviteEmail(bookingId, kind),
  emitBookingWebhook: (bookingId, kind, opts) => jobsEmitBookingWebhook(bookingId, kind, opts),
};

const HOLD_TTL_MINUTES = 10;

const holdBodySchema = z.object({
  eventTypeSlug: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  hosts: z.array(z.string().min(1)).optional(),
});

const bookingBodySchema = z.object({
  eventTypeSlug: z.string().min(1),
  holdIds: z.array(z.string().min(1)).min(1),
  invitee: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    timezone: z.string().min(1),
    // booking-form notes; whitespace-only collapses to absent
    notes: z
      .string()
      .max(2000)
      .optional()
      .transform((s) => (s?.trim() ? s.trim() : undefined)),
  }),
  // present when the booking came through a routing form (/routing/evaluate)
  routingAnswers: z
    .record(z.string(), z.union([z.string().max(1000), z.array(z.string().max(200)).max(50)]))
    .optional(),
});

const rescheduleBodySchema = z.object({
  rescheduleToken: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
});

const cancelBodySchema = z.object({
  cancelToken: z.string().min(1),
  reason: z.string().optional(),
});

function parseSlot(start: string, end: string): Interval | null {
  try {
    const slot = { start: Temporal.Instant.from(start), end: Temporal.Instant.from(end) };
    if (Temporal.Instant.compare(slot.start, slot.end) >= 0) return null;
    return slot;
  } catch {
    return null;
  }
}

function paddedWindow(slot: Interval, bufferBeforeMin: number, bufferAfterMin: number): Interval {
  return {
    start: slot.start.subtract({ minutes: bufferBeforeMin }),
    end: slot.end.add({ minutes: bufferAfterMin }),
  };
}

/**
 * Recomputes whether one host is actually free for `slot` (open minus busy,
 * buffers, minimum notice) - the "do not trust the client" check task 14
 * calls for at hold time. Deliberately independent of generateSlots'
 * grid-discretization (src/core/availability/slots.ts): a hold request names
 * an exact start/end, not a grid position, so this checks containment
 * directly rather than requiring the requested slot to land on a increment
 * boundary.
 */
function isSlotFreeForHost(
  schedule: HostSchedule,
  busy: readonly Interval[],
  slot: Interval,
  bufferBeforeMin: number,
  bufferAfterMin: number,
  minimumNoticeMin: number,
  now: Temporal.Instant,
): boolean {
  const noticeThreshold = now.add({ minutes: minimumNoticeMin });
  if (Temporal.Instant.compare(slot.start, noticeThreshold) < 0) return false;

  const paddedStart = slot.start.subtract({ minutes: bufferBeforeMin });
  const paddedEnd = slot.end.add({ minutes: bufferAfterMin });
  const window: Interval = { start: paddedStart, end: paddedEnd };
  const open = expandRules(schedule.rules, schedule.timezone, window);
  const free = subtract(open, busy);

  return free.some(
    (f) => Temporal.Instant.compare(f.start, paddedStart) <= 0 && Temporal.Instant.compare(paddedEnd, f.end) <= 0,
  );
}

/** Constant-time token comparison: reschedule/cancel are authenticated ONLY
 * by a signed token in the body (task 14), so a naive === would leak timing
 * information about how many leading bytes matched. */
function tokensMatch(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

interface RenderedInstant {
  readonly utc: string;
  readonly invitee: string;
}

function renderInstant(instant: Temporal.Instant, timezone: string): RenderedInstant {
  return { utc: instant.toString(), invitee: instant.toZonedDateTimeISO(timezone).toString() };
}

function renderBookingConfirmation(booking: BookingRow) {
  const suggestion = suggestEmailDomain(booking.inviteeEmail);
  return {
    bookingId: booking.id,
    hostUserIds: booking.hostUserIds,
    rescheduleToken: booking.rescheduleToken,
    cancelToken: booking.cancelToken,
    start: renderInstant(booking.startsAt, booking.inviteeTimezone),
    end: renderInstant(booking.endsAt, booking.inviteeTimezone),
    ...(suggestion ? { emailSuggestion: suggestion } : {}),
  };
}

function confirmHoldErrorStatus(kind: ConfirmHoldError["kind"]): 404 | 409 {
  return kind === "not_found" ? 404 : 409;
}

export function createBookingRoutes(deps: BookingDeps = defaultDeps): Hono {
  const router = new Hono();

  router.post("/holds", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = holdBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const { eventTypeSlug, start, end, hosts: requestedHosts } = parsed.data;

    const slot = parseSlot(start, end);
    if (!slot) return c.json({ error: "invalid_window" }, 400);

    const eventType = await deps.getEventTypeForBooking(eventTypeSlug);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);

    const durationMinutes = slot.start.until(slot.end).total({ unit: "minutes" });
    if (durationMinutes !== eventType.durationMinutes) {
      return c.json({ error: "duration_mismatch" }, 400);
    }

    const allHosts = await deps.getEventTypeHosts(eventType.id);

    let targetHostIds: string[];
    if (eventType.mode === "group") {
      const required = allHosts.filter((h) => h.role === "required").map((h) => h.userId);
      const extra = requestedHosts ?? [];
      const disallowed = extra.filter((id) => !eventType.publicSelectableHostIds.includes(id));
      if (disallowed.length > 0) {
        return c.json({ error: "hosts_not_selectable", hosts: disallowed }, 403);
      }
      targetHostIds = [...new Set([...required, ...extra])];
    } else if (eventType.mode === "round_robin") {
      targetHostIds = allHosts.filter((h) => h.role !== "optional").map((h) => h.userId);
    } else {
      const [host] = allHosts;
      targetHostIds = host ? [host.userId] : [];
    }

    if (targetHostIds.length === 0) return c.json({ error: "event_type_not_found" }, 404);

    const now = deps.now();
    const window = paddedWindow(slot, eventType.bufferBeforeMin, eventType.bufferAfterMin);
    const [scheduleRows, busyRows] = await Promise.all([
      deps.getSchedulesForUsers(targetHostIds),
      deps.getBusyForUsers(targetHostIds, window),
    ]);
    const schedulesByUser = new Map(scheduleRows.map((s) => [s.userId, s]));
    const busyByUser = new Map(busyRows.map((b) => [b.userId, b.intervals]));

    const freeHostIds = targetHostIds.filter((id) => {
      const schedule = schedulesByUser.get(id);
      if (!schedule) return false;
      return isSlotFreeForHost(
        schedule,
        busyByUser.get(id) ?? [],
        slot,
        eventType.bufferBeforeMin,
        eventType.bufferAfterMin,
        eventType.minimumNoticeMin,
        now,
      );
    });

    const requiresEveryone = eventType.mode !== "round_robin";
    if (requiresEveryone ? freeHostIds.length !== targetHostIds.length : freeHostIds.length === 0) {
      return c.json({ error: "slot_not_available" }, 409);
    }

    const hostUserIdsToHold = requiresEveryone ? targetHostIds : freeHostIds;
    const ttl = Temporal.Duration.from({ minutes: HOLD_TTL_MINUTES });
    const created = await deps.createHold(eventType.id, hostUserIdsToHold, slot, ttl);
    if (!created.ok) return c.json({ error: created.error.kind }, 409);

    return c.json(
      {
        holdIds: created.value.map((h) => h.id),
        expiresAt: now.add(ttl).toString(),
      },
      201,
    );
  });

  router.post("/bookings", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = bookingBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const { eventTypeSlug, holdIds, invitee, routingAnswers } = parsed.data;

    const eventType = await deps.getEventTypeForBooking(eventTypeSlug);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);

    let assignment: RoundRobinAssignment | undefined;
    if (eventType.mode === "round_robin") {
      const hosts = await deps.getEventTypeHosts(eventType.id);
      const candidates: AssignmentCandidate[] = hosts
        .filter((h) => h.role !== "optional")
        .map((h) => ({ userId: h.userId, weight: h.weight }));
      const history = await deps.getBookingHistoryForHosts(candidates.map((cand) => cand.userId));
      assignment = { candidates, history };
    }

    const confirmed = await deps.confirmHold(holdIds, invitee, assignment, routingAnswers);
    if (!confirmed.ok) {
      return c.json({ error: confirmed.error.kind }, confirmHoldErrorStatus(confirmed.error.kind));
    }

    const booking = await deps.getBookingById(confirmed.value.bookingId);
    if (!booking) return c.json({ error: "booking_not_found" }, 500);

    await deps.enqueueInviteEmail?.(booking.id, "created");
    await deps.emitBookingWebhook?.(booking.id, "created");

    return c.json(renderBookingConfirmation(booking), 201);
  });

  // Read side of the reschedule email link: token-authenticated booking
  // context so the reschedule page knows which event type's slots to show.
  router.get("/bookings/:id/reschedule-context", async (c) => {
    const id = c.req.param("id");
    const token = c.req.query("token");
    if (!token) return c.json({ error: "invalid_body" }, 400);

    const booking = await deps.getBookingById(id);
    if (!booking) return c.json({ error: "booking_not_found" }, 404);
    if (!tokensMatch(booking.rescheduleToken, token)) {
      return c.json({ error: "invalid_token" }, 403);
    }

    const eventType = await deps.getEventTypeForBookingById(booking.eventTypeId);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);

    return c.json({
      bookingId: booking.id,
      eventTypeSlug: eventType.slug,
      durationMinutes: eventType.durationMinutes,
      status: booking.status,
      start: renderInstant(booking.startsAt, booking.inviteeTimezone),
      end: renderInstant(booking.endsAt, booking.inviteeTimezone),
      inviteeTimezone: booking.inviteeTimezone,
      theme: resolveTheme(eventType.theme),
    });
  });

  router.post("/bookings/:id/reschedule", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = rescheduleBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const { rescheduleToken, start, end } = parsed.data;

    const booking = await deps.getBookingById(id);
    if (!booking) return c.json({ error: "booking_not_found" }, 404);
    if (!tokensMatch(booking.rescheduleToken, rescheduleToken)) {
      return c.json({ error: "invalid_token" }, 403);
    }

    const slot = parseSlot(start, end);
    if (!slot) return c.json({ error: "invalid_window" }, 400);

    const eventType = await deps.getEventTypeForBookingById(booking.eventTypeId);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);

    const durationMinutes = slot.start.until(slot.end).total({ unit: "minutes" });
    if (durationMinutes !== eventType.durationMinutes) {
      return c.json({ error: "duration_mismatch" }, 400);
    }

    const now = deps.now();
    const window = paddedWindow(slot, eventType.bufferBeforeMin, eventType.bufferAfterMin);
    const [scheduleRows, busyRows] = await Promise.all([
      deps.getSchedulesForUsers(booking.hostUserIds),
      deps.getBusyForUsers(booking.hostUserIds, window),
    ]);
    const schedulesByUser = new Map(scheduleRows.map((s) => [s.userId, s]));
    const busyByUser = new Map(busyRows.map((b) => [b.userId, b.intervals]));

    const allFree = booking.hostUserIds.every((hostId) => {
      const schedule = schedulesByUser.get(hostId);
      if (!schedule) return false;
      return isSlotFreeForHost(
        schedule,
        busyByUser.get(hostId) ?? [],
        slot,
        eventType.bufferBeforeMin,
        eventType.bufferAfterMin,
        eventType.minimumNoticeMin,
        now,
      );
    });
    if (!allFree) return c.json({ error: "slot_not_available" }, 409);

    const ttl = Temporal.Duration.from({ minutes: HOLD_TTL_MINUTES });
    const created = await deps.createHold(eventType.id, booking.hostUserIds, slot, ttl);
    if (!created.ok) return c.json({ error: created.error.kind }, 409);

    const rescheduled = await deps.confirmReschedule(
      booking.id,
      created.value.map((h) => h.id),
    );
    if (!rescheduled.ok) {
      const error = rescheduled.error;
      if ("reason" in error) return c.json({ error: "illegal_transition", reason: error.reason }, 409);
      return c.json({ error: error.kind }, confirmHoldErrorStatus(error.kind));
    }

    await deps.enqueueInviteEmail?.(booking.id, "rescheduled");
    await deps.emitBookingWebhook?.(booking.id, "rescheduled");

    return c.json({
      bookingId: booking.id,
      start: renderInstant(slot.start, booking.inviteeTimezone),
      end: renderInstant(slot.end, booking.inviteeTimezone),
    });
  });

  router.post("/bookings/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = cancelBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const { cancelToken, reason } = parsed.data;

    const booking = await deps.getBookingById(id);
    if (!booking) return c.json({ error: "booking_not_found" }, 404);
    if (!tokensMatch(booking.cancelToken, cancelToken)) {
      return c.json({ error: "invalid_token" }, 403);
    }

    const cancelled = await deps.cancelBooking(booking.id, reason);
    if (!cancelled.ok) {
      return c.json({ error: "illegal_transition", reason: cancelled.error.reason }, 409);
    }

    await deps.enqueueInviteEmail?.(booking.id, "cancelled");
    await deps.emitBookingWebhook?.(booking.id, "cancelled", { reason });

    return c.json({ bookingId: booking.id, status: cancelled.value.status });
  });

  return router;
}

export const bookingRoutes = createBookingRoutes();

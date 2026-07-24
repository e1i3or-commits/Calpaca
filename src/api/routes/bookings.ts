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
  getCapacityAwareBusyForUsers as dbGetCapacityAwareBusyForUsers,
  type BookingEventTypeConfig,
  type EventTypeHostRecord,
  type HostSchedule,
  type HostBusy,
} from "../../db/availability-repo";
import {
  createHold as dbCreateHold,
  confirmHold as dbConfirmHold,
  confirmReschedule as dbConfirmReschedule,
  countActiveHoldsForEventType as dbCountActiveHoldsForEventType,
  type Slot,
  type HoldRecord,
  type Invitee,
  type MeetingDetails,
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
import {
  effectiveOpenIntervals,
  forwardingIntervals,
} from "../../core/availability/overrides";
import { subtract, type Interval } from "../../core/availability/intervals";
import type { AssignmentCandidate, BookingRecord } from "../../core/assignment/round-robin";
import type { BookingState, BookingStateError } from "../../core/booking/state";
import {
  validateBookingAnswers,
  type BookingAnswers,
} from "../../core/booking/questions";
import { legacyLocations } from "../../core/booking/locations";
import { isAllowedDuration } from "../../core/booking/durations";
import type { RoutingAnswers } from "../../core/routing/condition";
import { ok, type Result } from "../../lib/result";
import { suggestEmailDomain } from "../../lib/email-typo";
import { resolveTheme } from "../../core/theming/themes";
import { enqueueInviteEmail as jobsEnqueueInviteEmail, emitBookingWebhook as jobsEmitBookingWebhook } from "../../jobs/index";
import { bucketStart, decide, type RateLimitDecision } from "../../core/ratelimit/window";
import { incrementRateLimit } from "../../db/rate-limit-repo";
import {
  createRateLimitMiddleware,
  positiveIntegerEnv,
} from "../rate-limit";
import { publicWorkspaceId } from "../public-workspace";
import {
  getOneOffOfferByPublicId as dbGetOneOffOfferByPublicId,
  type OneOffOffer,
} from "../../db/one-off-offer-repo";
import { validateBookingEmailReceipt } from "../../db/booking-email-verification-repo";

/** Same "inject repo functions, not module bindings" convention as
 * src/api/routes/availability.ts (task 13), so tests can stub every
 * dependency including the database-transaction-shaped ones (createHold,
 * confirmHold, confirmReschedule, cancelBooking) without a real Postgres. */
export interface BookingDeps {
  readonly getEventTypeForBooking: (
    slug: string,
    workspaceId?: string,
  ) => Promise<BookingEventTypeConfig | null>;
  readonly resolveWorkspaceId?: (
    context: Parameters<typeof publicWorkspaceId>[0],
    workspaceSlug?: string,
  ) => Promise<string | undefined>;
  readonly getEventTypeForBookingById: (id: string) => Promise<BookingEventTypeConfig | null>;
  readonly getEventTypeHosts: (eventTypeId: string) => Promise<EventTypeHostRecord[]>;
  readonly getSchedulesForUsers: (userIds: readonly string[]) => Promise<HostSchedule[]>;
  readonly getBusyForUsers: (userIds: readonly string[], window: Interval) => Promise<HostBusy[]>;
  readonly getCapacityAwareBusyForUsers?: (
    userIds: readonly string[],
    window: Interval,
    eventTypeId: string,
    capacity: number,
  ) => Promise<HostBusy[]>;
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
    meeting?: MeetingDetails,
    bookingAnswers?: BookingAnswers,
    offerPublicId?: string,
  ) => Promise<Result<ConfirmedBooking, ConfirmHoldError>>;
  readonly getOneOffOfferByPublicId?: (publicId: string) => Promise<OneOffOffer | null>;
  readonly validateEmailVerification?: (
    eventTypeId: string,
    email: string,
    receipt: string,
  ) => Promise<boolean>;
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
  readonly checkRateLimit?: (
    key: string,
    now: Temporal.Instant,
    limit: number,
    windowSeconds: number,
  ) => Promise<RateLimitDecision>;
  readonly countActiveHoldsForEventType?: (
    eventTypeId: string,
    now: Temporal.Instant,
  ) => Promise<number>;
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
  getEventTypeForBooking: (slug, workspaceId) =>
    dbGetEventTypeForBooking(slug, undefined, workspaceId),
  resolveWorkspaceId: publicWorkspaceId,
  getEventTypeForBookingById: (id) => dbGetEventTypeForBookingById(id),
  getEventTypeHosts: (eventTypeId) => dbGetEventTypeHosts(eventTypeId),
  getSchedulesForUsers: (userIds) => dbGetSchedulesForUsers(userIds),
  getBusyForUsers: (userIds, window) => dbGetBusyForUsers(userIds, window),
  getCapacityAwareBusyForUsers: (userIds, window, eventTypeId, capacity) =>
    dbGetCapacityAwareBusyForUsers(userIds, window, eventTypeId, capacity),
  createHold: (eventTypeId, hostUserIds, slot, ttl) => dbCreateHold(eventTypeId, hostUserIds, slot, ttl),
  confirmHold: (holdIds, invitee, assignment, routingAnswers, meeting, bookingAnswers, offerPublicId) =>
    dbConfirmHold(
      holdIds,
      invitee,
      undefined,
      assignment,
      routingAnswers,
      meeting,
      bookingAnswers,
      offerPublicId,
    ),
  getOneOffOfferByPublicId: (publicId) => dbGetOneOffOfferByPublicId(publicId),
  validateEmailVerification: (eventTypeId, email, receipt) =>
    validateBookingEmailReceipt(eventTypeId, email, receipt),
  confirmReschedule: (bookingId, holdIds) => dbConfirmReschedule(bookingId, holdIds),
  cancelBooking: async (bookingId, reason) => {
    const result = await appendEvent(bookingId, "cancelled", { reason });
    return result.ok ? ok(result.value) : result;
  },
  getBookingById: (id) => dbGetBookingById(id),
  getBookingHistoryForHosts: (hostUserIds) => dbGetBookingHistoryForHosts(hostUserIds),
  now: () => Temporal.Now.instant(),
  checkRateLimit: async (key, now, limit, windowSeconds) => {
    const bucket = bucketStart(now, windowSeconds);
    const count = await incrementRateLimit(key, bucket);
    const reset = bucket.add({ seconds: windowSeconds });
    return decide(count, limit, now.until(reset).total({ unit: "seconds" }));
  },
  countActiveHoldsForEventType: (eventTypeId, now) =>
    dbCountActiveHoldsForEventType(eventTypeId, now),
  enqueueInviteEmail: (bookingId, kind) => jobsEnqueueInviteEmail(bookingId, kind),
  emitBookingWebhook: (bookingId, kind, opts) => jobsEmitBookingWebhook(bookingId, kind, opts),
};

const HOLD_TTL_MINUTES = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

const holdBodySchema = z.object({
  eventTypeSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  hosts: z.array(z.string().min(1)).optional(),
  optionalHosts: z.array(z.string().min(1)).optional(),
  offerPublicId: z.string().min(1).optional(),
  agent: z.literal(true).optional(),
});

const bookingBodySchema = z.object({
  eventTypeSlug: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
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
  meetingFormat: z.enum(["phone", "google_meet"]).optional(),
  locationId: z.string().min(1).max(80).optional(),
  offerPublicId: z.string().min(1).optional(),
  emailVerificationToken: z.string().min(1).optional(),
  inviteePhone: z.string().trim().min(7).max(40).optional(),
  // present when the booking came through a routing form (/routing/evaluate)
  routingAnswers: z
    .record(z.string(), z.union([z.string().max(1000), z.array(z.string().max(200)).max(50)]))
    .optional(),
  bookingAnswers: z.record(z.string(), z.union([
    z.string().max(2000),
    z.array(z.string().max(200)).max(50),
    z.boolean(),
  ])).default({}),
  agent: z.literal(true).optional(),
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
  const open = effectiveOpenIntervals(
    schedule.rules,
    schedule.overrides ?? [],
    schedule.timezone,
    window,
  );
  const free = subtract(open, busy);

  return free.some(
    (f) => Temporal.Instant.compare(f.start, paddedStart) <= 0 && Temporal.Instant.compare(paddedEnd, f.end) <= 0,
  );
}

function resolveFreeHost(
  userId: string,
  schedules: ReadonlyMap<string, HostSchedule>,
  busy: ReadonlyMap<string, readonly Interval[]>,
  slot: Interval,
  bufferBeforeMin: number,
  bufferAfterMin: number,
  minimumNoticeMin: number,
  now: Temporal.Instant,
  visited = new Set<string>(),
): string | null {
  if (visited.has(userId)) return null;
  const schedule = schedules.get(userId);
  if (!schedule) return null;
  if (isSlotFreeForHost(
    schedule,
    busy.get(userId) ?? [],
    slot,
    bufferBeforeMin,
    bufferAfterMin,
    minimumNoticeMin,
    now,
  )) {
    return userId;
  }

  const padded = paddedWindow(slot, bufferBeforeMin, bufferAfterMin);
  const nextVisited = new Set(visited).add(userId);
  for (const targetUserId of new Set(
    (schedule.overrides ?? []).flatMap((override) =>
      override.forwardToUserId ? [override.forwardToUserId] : [],
    ),
  )) {
    const forwarding = forwardingIntervals(
      schedule.overrides ?? [],
      schedule.timezone,
      targetUserId,
      padded,
    );
    if (!forwarding.some((interval) =>
      Temporal.Instant.compare(interval.start, padded.start) <= 0 &&
      Temporal.Instant.compare(padded.end, interval.end) <= 0
    )) continue;
    const resolved = resolveFreeHost(
      targetUserId,
      schedules,
      busy,
      slot,
      bufferBeforeMin,
      bufferAfterMin,
      minimumNoticeMin,
      now,
      nextVisited,
    );
    if (resolved) return resolved;
  }
  return null;
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

  router.use("/holds", createRateLimitMiddleware(deps, {
    scope: "holds",
    envName: "RATE_LIMIT_HOLDS_PER_MINUTE",
    defaultLimit: 20,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  }));
  router.use("/bookings", createRateLimitMiddleware(deps, {
    scope: "bookings",
    envName: "RATE_LIMIT_BOOKINGS_PER_MINUTE",
    defaultLimit: 10,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  }));

  router.post("/holds", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = holdBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const {
      eventTypeSlug,
      workspaceSlug,
      start,
      end,
      hosts: requestedHosts,
      optionalHosts: requestedOptionalHosts,
      agent,
      offerPublicId,
    } = parsed.data;

    const slot = parseSlot(start, end);
    if (!slot) return c.json({ error: "invalid_window" }, 400);

    const workspaceId = deps.resolveWorkspaceId
      ? await deps.resolveWorkspaceId(c, workspaceSlug)
      : undefined;
    if (process.env.CALPACA_DEPLOYMENT_MODE === "hosted" && !workspaceId) {
      return c.json({ error: "event_type_not_found" }, 404);
    }
    const eventType = await deps.getEventTypeForBooking(eventTypeSlug, workspaceId);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);
    if (agent && !eventType.agentPolicy?.enabled) {
      return c.json({ error: "agent_not_allowed" }, 403);
    }
    if (offerPublicId && deps.getOneOffOfferByPublicId) {
      const offer = await deps.getOneOffOfferByPublicId(offerPublicId);
      const allowed = offer
        && offer.status === "active"
        && offer.eventTypeId === eventType.id
        && offer.expiresAt > new Date()
        && offer.slots.some((candidate) =>
          Temporal.Instant.compare(Temporal.Instant.from(candidate.start), slot.start) === 0
          && Temporal.Instant.compare(Temporal.Instant.from(candidate.end), slot.end) === 0
        );
      if (!allowed) return c.json({ error: "offer_unavailable" }, 409);
    }

    const now = deps.now();
    const activeHoldCeiling = positiveIntegerEnv("ACTIVE_HOLDS_PER_EVENT_TYPE", 50);
    if (
      deps.countActiveHoldsForEventType &&
      (await deps.countActiveHoldsForEventType(eventType.id, now)) >= activeHoldCeiling
    ) {
      return c.json({ error: "holds_exhausted" }, 429);
    }

    const durationMinutes = slot.start.until(slot.end).total({ unit: "minutes" });
    if (!isAllowedDuration(
      durationMinutes,
      eventType.durationMinutes,
      eventType.selectableDurations,
    )) {
      return c.json({ error: "duration_mismatch" }, 400);
    }

    const allHosts = await deps.getEventTypeHosts(eventType.id);

    let targetHostIds: string[];
    if (eventType.mode === "group") {
      const required = allHosts.filter((h) => h.role === "required").map((h) => h.userId);
      const selected = requestedHosts ?? required;
      const disallowed = requestedHosts
        ? selected.filter((id) => !eventType.publicSelectableHostIds.includes(id))
        : [];
      if (disallowed.length > 0) {
        return c.json({ error: "hosts_not_selectable", hosts: disallowed }, 403);
      }
      const invalidOptional = (requestedOptionalHosts ?? []).filter(
        (id) => !selected.includes(id),
      );
      if (invalidOptional.length > 0) {
        return c.json({ error: "hosts_not_selectable", hosts: invalidOptional }, 403);
      }
      targetHostIds = [...new Set(selected)];
    } else if (eventType.mode === "round_robin") {
      targetHostIds = allHosts.filter((h) => h.role !== "optional").map((h) => h.userId);
    } else {
      const [host] = allHosts;
      targetHostIds = host ? [host.userId] : [];
    }

    if (targetHostIds.length === 0) return c.json({ error: "event_type_not_found" }, 404);

    const window = paddedWindow(slot, eventType.bufferBeforeMin, eventType.bufferAfterMin);
    const scheduleRows = await deps.getSchedulesForUsers(targetHostIds);
    const capacity = eventType.capacity ?? 1;
    const busyRows = capacity > 1 && deps.getCapacityAwareBusyForUsers
      ? await deps.getCapacityAwareBusyForUsers(
          scheduleRows.map((schedule) => schedule.userId),
          window,
          eventType.id,
          capacity,
        )
      : await deps.getBusyForUsers(
          scheduleRows.map((schedule) => schedule.userId),
          window,
        );
    const schedulesByUser = new Map(scheduleRows.map((s) => [s.userId, s]));
    const busyByUser = new Map(busyRows.map((b) => [b.userId, b.intervals]));

    const resolvedHostIds = targetHostIds.map((id) =>
      resolveFreeHost(
        id,
        schedulesByUser,
        busyByUser,
        slot,
        eventType.bufferBeforeMin,
        eventType.bufferAfterMin,
        eventType.minimumNoticeMin,
        now,
      ),
    );
    const freeHostIds = [...new Set(resolvedHostIds.filter(
      (id): id is string => id !== null,
    ))];

    const requiredTargetHostIds =
      eventType.mode === "group" && requestedOptionalHosts
        ? targetHostIds.filter((id) => !requestedOptionalHosts.includes(id))
        : targetHostIds;
    const requiresEveryone = eventType.mode !== "round_robin";
    const requiredHostsFree = requiredTargetHostIds.every((id) =>
      resolvedHostIds[targetHostIds.indexOf(id)] !== null,
    );
    const requiredResolvedIds = requiredTargetHostIds.flatMap((id) => {
      const resolved = resolvedHostIds[targetHostIds.indexOf(id)];
      return resolved ? [resolved] : [];
    });
    const distinctRequiredHosts =
      new Set(requiredResolvedIds).size === requiredResolvedIds.length;
    if (requiresEveryone ? !requiredHostsFree : freeHostIds.length === 0) {
      return c.json({ error: "slot_not_available" }, 409);
    }
    if (eventType.mode === "group" && !distinctRequiredHosts) {
      return c.json({ error: "slot_not_available" }, 409);
    }

    const hostUserIdsToHold =
      eventType.mode === "group" && requestedOptionalHosts
        ? freeHostIds
        : requiresEveryone
          ? resolvedHostIds.filter((id): id is string => id !== null)
          : freeHostIds;
    const ttlMinutes =
      agent && eventType.agentPolicy?.autoExpireHoldsMin !== undefined
        ? Math.min(HOLD_TTL_MINUTES, eventType.agentPolicy.autoExpireHoldsMin)
        : HOLD_TTL_MINUTES;
    const ttl = Temporal.Duration.from({ minutes: ttlMinutes });
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
    const {
      eventTypeSlug,
      workspaceSlug,
      holdIds,
      invitee,
      routingAnswers,
      agent,
      inviteePhone,
    } = parsed.data;

    const workspaceId = deps.resolveWorkspaceId
      ? await deps.resolveWorkspaceId(c, workspaceSlug)
      : undefined;
    if (process.env.CALPACA_DEPLOYMENT_MODE === "hosted" && !workspaceId) {
      return c.json({ error: "event_type_not_found" }, 404);
    }
    const eventType = await deps.getEventTypeForBooking(eventTypeSlug, workspaceId);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);
    if (agent && !eventType.agentPolicy?.enabled) {
      return c.json({ error: "agent_not_allowed" }, 403);
    }
    if (
      eventType.emailVerificationRequired
      && (!parsed.data.emailVerificationToken
        || !deps.validateEmailVerification
        || !await deps.validateEmailVerification(
          eventType.id,
          invitee.email,
          parsed.data.emailVerificationToken,
        ))
    ) {
      return c.json({ error: "email_verification_required" }, 403);
    }
    const locations = eventType.locations?.length
      ? eventType.locations
      : legacyLocations(eventType.meetingFormats ?? ["google_meet"]);
    const selectedLocation = parsed.data.locationId
      ? locations.find((location) => location.id === parsed.data.locationId)
      : parsed.data.meetingFormat
        ? locations.find((location) => location.type === parsed.data.meetingFormat)
        : locations[0];
    if (!selectedLocation) {
      return c.json({
        error: parsed.data.locationId
          ? "location_not_allowed"
          : "meeting_format_not_allowed",
      }, 400);
    }
    if (
      selectedLocation.type === "phone"
      && (selectedLocation.phoneDirection ?? "organizer_calls_invitee") === "organizer_calls_invitee"
      && !inviteePhone
    ) {
      return c.json({ error: "phone_required" }, 400);
    }
    const validatedAnswers = validateBookingAnswers(
      eventType.bookingQuestions ?? [],
      parsed.data.bookingAnswers,
    );
    if (!validatedAnswers.ok) {
      return c.json({ error: "invalid_booking_answers", issues: validatedAnswers.issues }, 400);
    }

    let assignment: RoundRobinAssignment | undefined;
    if (eventType.mode === "round_robin") {
      const hosts = await deps.getEventTypeHosts(eventType.id);
      const pool = hosts.filter((host) => host.role !== "optional");
      const schedules = await deps.getSchedulesForUsers(pool.map((host) => host.userId));
      const weightByUser = new Map<string, number>();
      for (const host of pool) weightByUser.set(host.userId, host.weight);
      for (const schedule of schedules) {
        const sourceWeight = weightByUser.get(schedule.userId);
        if (sourceWeight === undefined) continue;
        for (const targetId of (schedule.overrides ?? []).flatMap((override) =>
          override.forwardToUserId ? [override.forwardToUserId] : [],
        )) {
          if (!weightByUser.has(targetId)) weightByUser.set(targetId, sourceWeight);
        }
      }
      const candidates: AssignmentCandidate[] = [...weightByUser]
        .map(([userId, weight]) => ({ userId, weight }));
      const history = await deps.getBookingHistoryForHosts(candidates.map((cand) => cand.userId));
      assignment = { candidates, history };
    }

    const confirmed = await deps.confirmHold(
      holdIds,
      invitee,
      assignment,
      routingAnswers,
      {
        format: selectedLocation.type,
        location: selectedLocation,
        ...(inviteePhone ? { phone: inviteePhone } : {}),
      },
      validatedAnswers.answers,
      parsed.data.offerPublicId,
    );
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
      durationMinutes: booking.startsAt.until(booking.endsAt).total({ unit: "minutes" }),
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
    const originalDuration = booking.startsAt.until(booking.endsAt).total({ unit: "minutes" });
    if (durationMinutes !== originalDuration) {
      return c.json({ error: "duration_mismatch" }, 400);
    }

    const now = deps.now();
    const window = paddedWindow(slot, eventType.bufferBeforeMin, eventType.bufferAfterMin);
    const scheduleRows = await deps.getSchedulesForUsers(booking.hostUserIds);
    const capacity = eventType.capacity ?? 1;
    const busyRows = capacity > 1 && deps.getCapacityAwareBusyForUsers
      ? await deps.getCapacityAwareBusyForUsers(
          scheduleRows.map((schedule) => schedule.userId),
          window,
          eventType.id,
          capacity,
        )
      : await deps.getBusyForUsers(
          scheduleRows.map((schedule) => schedule.userId),
          window,
        );
    const schedulesByUser = new Map(scheduleRows.map((s) => [s.userId, s]));
    const busyByUser = new Map(busyRows.map((b) => [b.userId, b.intervals]));

    const resolvedHostIds = booking.hostUserIds.map((hostId) =>
      resolveFreeHost(
        hostId,
        schedulesByUser,
        busyByUser,
        slot,
        eventType.bufferBeforeMin,
        eventType.bufferAfterMin,
        eventType.minimumNoticeMin,
        now,
      ),
    );
    if (
      resolvedHostIds.some((hostId) => hostId === null) ||
      new Set(resolvedHostIds).size !== resolvedHostIds.length
    ) {
      return c.json({ error: "slot_not_available" }, 409);
    }

    const ttl = Temporal.Duration.from({ minutes: HOLD_TTL_MINUTES });
    const created = await deps.createHold(
      eventType.id,
      resolvedHostIds as string[],
      slot,
      ttl,
    );
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

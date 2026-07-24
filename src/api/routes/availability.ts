import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import {
  getEventTypeBySlug as dbGetEventTypeBySlug,
  getEventTypeHosts as dbGetEventTypeHosts,
  getEventTypeProfile as dbGetEventTypeProfile,
  getPublicBookingPage as dbGetPublicBookingPage,
  getSchedulesForUsers as dbGetSchedulesForUsers,
  getBusyForUsers as dbGetBusyForUsers,
  getAvailabilityEvidenceForUsers as dbGetAvailabilityEvidenceForUsers,
  getCapacityAwareBusyForUsers as dbGetCapacityAwareBusyForUsers,
  getEventTypeSlotOccupancy as dbGetEventTypeSlotOccupancy,
  type EventTypeConfig,
  type EventTypeHostRecord,
  type EventTypeProfile,
  type HostSchedule,
  type HostBusy,
  type HostAvailabilityEvidence,
  type PublicBookingPage,
} from "../../db/availability-repo";
import {
  effectiveOpenIntervals,
  forwardingIntervals,
} from "../../core/availability/overrides";
import {
  intersectMany,
  normalize,
  subtract,
  type Interval,
} from "../../core/availability/intervals";
import { generateSlots, type SlotConfig } from "../../core/availability/slots";
import { scoreSlots } from "../../core/availability/scoring";
import type { ScoringSignals } from "../../core/availability/scoring";
import {
  confidenceFromEvidence,
  recommendationProvenance,
  type RecommendationProvenance,
} from "../../core/availability/provenance";
import { groupAvailability, type GroupHost } from "../../core/availability/group";
import { resolveBookingLayout, resolveTheme } from "../../core/theming/themes";
import { publicWorkspaceId } from "../public-workspace";
import { legacyLocations } from "../../core/booking/locations";
import { allowedDurations } from "../../core/booking/durations";
import { getInviteeCalendarSession as dbGetInviteeCalendarSession } from "../../db/invitee-calendar-repo";
import { rankByMutualAvailability } from "../../core/availability/mutual";
import { getPublicWorkspaceEntitlements } from "../../db/workspace-repo";

/**
 * Repo access the route needs, as plain functions rather than imported
 * module bindings so tests can inject stubs (per task 13: "inject repo
 * functions; do not mock module internals"). `now` is injected for the same
 * reason - minimum notice / rolling window math is time-dependent.
 */
export interface AvailabilityDeps {
  readonly getEventTypeBySlug: (slug: string, workspaceId?: string) => Promise<EventTypeConfig | null>;
  readonly resolveWorkspaceId?: (
    context: Parameters<typeof publicWorkspaceId>[0],
    workspaceSlug?: string,
  ) => Promise<string | undefined>;
  readonly getEventTypeHosts: (eventTypeId: string) => Promise<EventTypeHostRecord[]>;
  /** optional so injected test fixtures predating the booking-page profile
   * stay valid; when absent the meta response simply omits `profile` */
  readonly getEventTypeProfile?: (eventTypeId: string) => Promise<EventTypeProfile>;
  readonly getSchedulesForUsers: (userIds: readonly string[]) => Promise<HostSchedule[]>;
  readonly getBusyForUsers: (userIds: readonly string[], window: Interval) => Promise<HostBusy[]>;
  readonly getAvailabilityEvidenceForUsers?: (
    userIds: readonly string[],
  ) => Promise<HostAvailabilityEvidence[]>;
  readonly getCapacityAwareBusyForUsers?: (
    userIds: readonly string[],
    window: Interval,
    eventTypeId: string,
    capacity: number,
  ) => Promise<HostBusy[]>;
  readonly getEventTypeSlotOccupancy?: (
    eventTypeId: string,
    window: Interval,
    now: Temporal.Instant,
  ) => Promise<Map<string, number>>;
  readonly now: () => Temporal.Instant;
  readonly getInviteeCalendarSession?: (
    capability: string,
  ) => Promise<{ busy: { start: string; end: string }[]; expiresAt: Date } | null>;
  readonly inviteeCalendarEnabled?: (workspaceId: string) => Promise<boolean>;
  readonly getPublicBookingPage?: (
    workspaceId: string,
    pageSlug?: string,
  ) => Promise<PublicBookingPage | null>;
}

const defaultDeps: AvailabilityDeps = {
  getEventTypeBySlug: (slug, workspaceId) =>
    dbGetEventTypeBySlug(slug, undefined, workspaceId),
  resolveWorkspaceId: publicWorkspaceId,
  getEventTypeHosts: (eventTypeId) => dbGetEventTypeHosts(eventTypeId),
  getEventTypeProfile: (eventTypeId) => dbGetEventTypeProfile(eventTypeId),
  getSchedulesForUsers: (userIds) => dbGetSchedulesForUsers(userIds),
  getBusyForUsers: (userIds, window) => dbGetBusyForUsers(userIds, window),
  getAvailabilityEvidenceForUsers: (userIds) =>
    dbGetAvailabilityEvidenceForUsers(userIds),
  getCapacityAwareBusyForUsers: (userIds, window, eventTypeId, capacity) =>
    dbGetCapacityAwareBusyForUsers(userIds, window, eventTypeId, capacity),
  getEventTypeSlotOccupancy: (eventTypeId, window, now) =>
    dbGetEventTypeSlotOccupancy(eventTypeId, window, now),
  now: () => Temporal.Now.instant(),
  getInviteeCalendarSession: (capability) => dbGetInviteeCalendarSession(capability),
  inviteeCalendarEnabled: async (workspaceId) =>
    (await getPublicWorkspaceEntitlements(workspaceId))?.inviteeCalendarOverlay ?? false,
  getPublicBookingPage: (workspaceId, pageSlug) => dbGetPublicBookingPage(workspaceId, pageSlug),
};

const querySchema = z.object({
  eventTypeSlug: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  inviteeTimezone: z.string().min(1),
  workspaceSlug: z.string().min(1).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
});

interface RenderedInstant {
  readonly utc: string;
  readonly invitee: string;
}

interface SlotDto {
  readonly start: RenderedInstant;
  readonly end: RenderedInstant;
  readonly score: number;
  readonly localHourWarning: boolean;
  readonly mutual?: boolean;
  readonly seatsRemaining?: number;
  readonly recommendation: RecommendationProvenance;
}

const LOCAL_HOUR_MIN = 7;
const LOCAL_HOUR_MAX = 21;

function isOutsideLocalHours(instant: Temporal.Instant, timezone: string): boolean {
  const zdt = instant.toZonedDateTimeISO(timezone);
  const hour = zdt.hour + zdt.minute / 60;
  return hour < LOCAL_HOUR_MIN || hour >= LOCAL_HOUR_MAX;
}

function renderSlot(
  slot: Interval,
  score: number,
  inviteeTimezone: string,
  mutual?: boolean,
  seatsRemaining?: number,
  recommendation?: RecommendationProvenance,
): SlotDto {
  return {
    start: {
      utc: slot.start.toString(),
      invitee: slot.start.toZonedDateTimeISO(inviteeTimezone).toString(),
    },
    end: {
      utc: slot.end.toString(),
      invitee: slot.end.toZonedDateTimeISO(inviteeTimezone).toString(),
    },
    score,
    localHourWarning: isOutsideLocalHours(slot.start, inviteeTimezone),
    recommendation: recommendation ?? {
      confidence: "unknown",
      reasons: [{
        kind: "warning",
        label: "Calendar verification unavailable",
        detail: "This time matches configured availability, but current calendar evidence is unavailable.",
      }, {
        kind: "positive",
        label: "Fits the booking rules",
        detail: "This time satisfies duration, notice, buffer, and availability requirements.",
      }],
    },
    ...(mutual === undefined ? {} : { mutual }),
    ...(seatsRemaining === undefined ? {} : { seatsRemaining }),
  };
}

function slotKey(slot: Interval): string {
  return `${slot.start.toString()}|${slot.end.toString()}`;
}

function freeForHost(
  userId: string,
  schedules: ReadonlyMap<string, HostSchedule>,
  busy: ReadonlyMap<string, readonly Interval[]>,
  window: Interval,
  visited = new Set<string>(),
): Interval[] {
  if (visited.has(userId)) return [];
  const schedule = schedules.get(userId);
  if (!schedule) return [];
  const nextVisited = new Set(visited).add(userId);
  const own = subtract(
    effectiveOpenIntervals(
      schedule.rules,
      schedule.overrides ?? [],
      schedule.timezone,
      window,
    ),
    busy.get(userId) ?? [],
  );
  const forwarded = [...new Set(
    (schedule.overrides ?? []).flatMap((override) =>
      override.forwardToUserId ? [override.forwardToUserId] : [],
    ),
  )].flatMap((targetUserId) => {
    const windows = forwardingIntervals(
      schedule.overrides ?? [],
      schedule.timezone,
      targetUserId,
      window,
    );
    const targetFree = freeForHost(targetUserId, schedules, busy, window, nextVisited);
    return intersectMany([windows, targetFree]);
  });
  return normalize([...own, ...forwarded]);
}

type ProvenanceSlot = {
  slot: Interval;
  score: number;
  signals: ScoringSignals;
  hostUserId?: string;
  optionalParticipantConflict: boolean;
};

/**
 * Availability with no hosts[] filter: union of every host configured on the
 * event type (mirrors src/core/assignment/round-robin.ts teamAvailability),
 * scored per host and deduped by keeping the best score per distinct slot. A
 * solo event type has exactly one host, so this degenerates to that host's
 * own scored slots.
 */
function soloAvailability(
  hosts: readonly EventTypeHostRecord[],
  schedulesByUser: ReadonlyMap<string, HostSchedule>,
  busyByUser: ReadonlyMap<string, readonly Interval[]>,
  config: SlotConfig,
  window: Interval,
  now: Temporal.Instant,
): ProvenanceSlot[] {
  const bestByKey = new Map<string, ProvenanceSlot>();

  for (const host of hosts) {
    const schedule = schedulesByUser.get(host.userId);
    if (!schedule) continue;

    const open = freeForHost(host.userId, schedulesByUser, busyByUser, window);
    const busy = busyByUser.get(host.userId) ?? [];
    const candidates = generateSlots(open, { ...config, timezone: schedule.timezone }, now);
    const scored = scoreSlots(candidates, { busy, open, prefs: {}, timezone: schedule.timezone });

    for (const { slot, score, signals } of scored) {
      const key = slotKey(slot);
      const existing = bestByKey.get(key);
      if (!existing || score > existing.score) {
        bestByKey.set(key, {
          slot,
          score,
          signals,
          hostUserId: host.userId,
          optionalParticipantConflict: false,
        });
      }
    }
  }

  return [...bestByKey.values()].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Temporal.Instant.compare(a.slot.start, b.slot.start);
  });
}

/** event_type_hosts.role has a third value ("member") with no group meaning;
 * treated as required since presence in hosts[] means "must be free." */
function groupHostRole(role: EventTypeHostRecord["role"]): "required" | "optional" {
  return role === "optional" ? "optional" : "required";
}

export function createAvailabilityRoutes(deps: AvailabilityDeps = defaultDeps): Hono {
  const router = new Hono();

  router.get("/booking-page", async (c) => {
    const workspaceId = deps.resolveWorkspaceId
      ? await deps.resolveWorkspaceId(c, c.req.query("workspaceSlug"))
      : undefined;
    if (!workspaceId || !deps.getPublicBookingPage) {
      return c.json({ error: "booking_page_not_found" }, 404);
    }
    const page = await deps.getPublicBookingPage(workspaceId, c.req.query("pageSlug"));
    return page
      ? c.json(page)
      : c.json({ error: "booking_page_not_found" }, 404);
  });

  // Public identity of a booking link: what the booking page needs before it
  // has any slots — the real title, the theme to render with, and who the
  // invitee is meeting (host/team display names + avatars; emails stay out).
  // Config that could leak host behavior (buffers, notice) stays private.
  router.get("/event-types/:slug", async (c) => {
    const workspaceSlug = c.req.query("workspaceSlug");
    const workspaceId = deps.resolveWorkspaceId
      ? await deps.resolveWorkspaceId(c, workspaceSlug)
      : undefined;
    if (process.env.CALPACA_DEPLOYMENT_MODE === "hosted" && !workspaceId) {
      return c.json({ error: "event_type_not_found" }, 404);
    }
    const eventType = await deps.getEventTypeBySlug(c.req.param("slug"), workspaceId);
    if (!eventType) return c.json({ error: "event_type_not_found" }, 404);

    const profile = deps.getEventTypeProfile
      ? await deps.getEventTypeProfile(eventType.id)
      : undefined;
    const selectableHosts =
      eventType.mode === "group" && eventType.publicSelectableHostIds.length > 0
        ? (await deps.getEventTypeHosts(eventType.id)).flatMap((host) =>
            eventType.publicSelectableHostIds.includes(host.userId) &&
            host.name !== undefined
              ? [
                  {
                    id: host.userId,
                    name: host.name,
                    image: host.image ?? null,
                    role: groupHostRole(host.role),
                  },
                ]
              : [],
          )
        : undefined;
    const inviteeCalendarOverlay = workspaceId && deps.inviteeCalendarEnabled
      ? await deps.inviteeCalendarEnabled(workspaceId)
      : undefined;

    return c.json({
      slug: eventType.slug,
      title: eventType.title ?? eventType.slug,
      durationMinutes: eventType.durationMinutes,
      ...(eventType.selectableDurations?.length
        ? { selectableDurations: eventType.selectableDurations }
        : {}),
      theme: resolveTheme(eventType.theme),
      ...(eventType.description ? { description: eventType.description } : {}),
      ...((eventType.logoUrl || resolveTheme(eventType.theme) === "tourscale")
        ? { logoUrl: eventType.logoUrl ?? "/brand/tourscale-logo-color.svg" }
        : {}),
      ...(eventType.meetingFormats ? { meetingFormats: eventType.meetingFormats } : {}),
      ...(eventType.bookingQuestions ? { bookingQuestions: eventType.bookingQuestions } : {}),
      ...(eventType.emailVerificationRequired ? { emailVerificationRequired: true } : {}),
      ...(eventType.locations
        ? {
            locations: eventType.locations.length
              ? eventType.locations.map((configuredLocation) => {
                  const { hostOverrides, ...location } = configuredLocation;
                  void hostOverrides;
                  return location;
                })
              : legacyLocations(eventType.meetingFormats ?? ["google_meet"]),
          }
        : {}),
      ...((eventType.capacity ?? 1) > 1 ? { capacity: eventType.capacity } : {}),
      ...(eventType.layout ? { layout: resolveBookingLayout(eventType.layout) } : {}),
      ...(profile ? { profile } : {}),
      ...(eventType.agentPolicy
        ? { agentPolicy: { enabled: eventType.agentPolicy.enabled } }
        : {}),
      ...(selectableHosts ? { selectableHosts } : {}),
      ...(inviteeCalendarOverlay === undefined ? {} : { inviteeCalendarOverlay }),
    });
  });

  router.get("/availability", async (c) => {
    const parsedQuery = querySchema.safeParse({
      eventTypeSlug: c.req.query("eventTypeSlug"),
      start: c.req.query("start"),
      end: c.req.query("end"),
      inviteeTimezone: c.req.query("inviteeTimezone"),
      workspaceSlug: c.req.query("workspaceSlug"),
      durationMinutes: c.req.query("durationMinutes"),
    });
    if (!parsedQuery.success) {
      return c.json({ error: "invalid_query", issues: parsedQuery.error.issues }, 400);
    }
    const {
      eventTypeSlug,
      start,
      end,
      inviteeTimezone,
      workspaceSlug,
      durationMinutes: requestedDuration,
    } = parsedQuery.data;
    const requestedHosts = c.req.queries("hosts");
    const requestedOptionalHosts = c.req.queries("optionalHosts") ?? [];
    const overrideHostRoles = c.req.query("overrideHostRoles") === "true";

    let windowStart: Temporal.Instant;
    let windowEnd: Temporal.Instant;
    try {
      windowStart = Temporal.Instant.from(start);
      windowEnd = Temporal.Instant.from(end);
      // Validate the timezone name eagerly so a bad one 400s here rather than
      // surfacing as a RangeError deep inside slot rendering.
      Temporal.Now.zonedDateTimeISO(inviteeTimezone);
    } catch {
      return c.json({ error: "invalid_window_or_timezone" }, 400);
    }
    if (Temporal.Instant.compare(windowStart, windowEnd) >= 0) {
      return c.json({ error: "window_start_must_precede_end" }, 400);
    }
    const window: Interval = { start: windowStart, end: windowEnd };

    const workspaceId = deps.resolveWorkspaceId
      ? await deps.resolveWorkspaceId(c, workspaceSlug)
      : undefined;
    if (process.env.CALPACA_DEPLOYMENT_MODE === "hosted" && !workspaceId) {
      return c.json({ error: "event_type_not_found" }, 404);
    }
    const eventType = await deps.getEventTypeBySlug(eventTypeSlug, workspaceId);
    if (!eventType) {
      return c.json({ error: "event_type_not_found" }, 404);
    }
    const configuredDurations = allowedDurations(
      eventType.durationMinutes,
      eventType.selectableDurations,
    );
    const durationMinutes = requestedDuration ?? eventType.durationMinutes;
    if (!configuredDurations.includes(durationMinutes)) {
      return c.json({ error: "duration_not_allowed" }, 400);
    }

    const isGroup = requestedHosts !== undefined && requestedHosts.length > 0;
    if (isGroup) {
      const disallowed = requestedHosts.filter((id) => !eventType.publicSelectableHostIds.includes(id));
      if (disallowed.length > 0) {
        return c.json({ error: "hosts_not_selectable", hosts: disallowed }, 403);
      }
    }

    const allHosts = await deps.getEventTypeHosts(eventType.id);
    const selectedHosts = isGroup
      ? allHosts
          .filter((h) => requestedHosts.includes(h.userId))
          .map((host) =>
            overrideHostRoles
              ? {
                  ...host,
                  role: requestedOptionalHosts.includes(host.userId)
                    ? ("optional" as const)
                    : ("required" as const),
                }
              : host,
          )
      : allHosts;

    const userIds = selectedHosts.map((h) => h.userId);
    const scheduleRows = await deps.getSchedulesForUsers(userIds);
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

    const now = deps.now();
    const evidenceRows = deps.getAvailabilityEvidenceForUsers
      ? await deps.getAvailabilityEvidenceForUsers(userIds)
      : [];
    const evidenceByUser = new Map(evidenceRows.map((evidence) => [
      evidence.userId,
      {
        connected: evidence.connected,
        healthy: evidence.healthy
          && evidence.lastSyncedAt !== null
          && now.epochMilliseconds - evidence.lastSyncedAt.getTime() <= 86_400_000,
        ...(evidence.lastSyncedAt
          ? { checkedAt: evidence.lastSyncedAt.toISOString() }
          : {}),
      },
    ]));
    const baseConfig: SlotConfig = {
      durationMinutes,
      bufferBeforeMin: eventType.bufferBeforeMin,
      bufferAfterMin: eventType.bufferAfterMin,
      minimumNoticeMin: eventType.minimumNoticeMin,
      rollingWindowDays: eventType.rollingWindowDays,
      maxPerDay: eventType.maxPerDay ?? undefined,
      timezone: "UTC",
    };

    let scoredSlots: ProvenanceSlot[];
    let quorum:
      | {
          missingHost: { id: string; name: string };
          slots: SlotDto[];
        }
      | undefined;
    if (isGroup) {
      const groupHosts: GroupHost[] = selectedHosts.flatMap((host) => {
        const schedule = schedulesByUser.get(host.userId);
        if (!schedule) return [];
        return [
          {
            userId: host.userId,
            open: freeForHost(
              host.userId,
              schedulesByUser,
              busyByUser,
              window,
            ),
            busy: [],
            role: groupHostRole(host.role),
            prefs: {},
            timezone: schedule.timezone,
          },
        ];
      });
      const groupConfig: SlotConfig = {
        ...baseConfig,
        timezone: groupHosts[0]?.timezone ?? baseConfig.timezone,
      };
      const groupResult = groupAvailability(groupHosts, groupConfig, now);
      scoredSlots = [...groupResult.full];
      const [bestFallback] = groupResult.fallback;
      if (scoredSlots.length === 0 && bestFallback) {
        const missingHost = selectedHosts.find(
          (host) => host.userId === bestFallback.missingUserId,
        );
        quorum = {
          missingHost: {
            id: bestFallback.missingUserId,
            name: missingHost?.name ?? bestFallback.missingUserId,
          },
          slots: bestFallback.slots.map((s) => {
            const requiredIds = selectedHosts
              .filter((host) =>
                groupHostRole(host.role) === "required"
                && host.userId !== bestFallback.missingUserId,
              )
              .map((host) => host.userId);
            const confidence = confidenceFromEvidence(
              requiredIds.flatMap((id) => {
                const evidence = evidenceByUser.get(id);
                return evidence ? [evidence] : [];
              }),
              requiredIds.length,
            );
            const localHourWarning = isOutsideLocalHours(s.slot.start, inviteeTimezone);
            return renderSlot(
              s.slot,
              s.score,
              inviteeTimezone,
              undefined,
              undefined,
              recommendationProvenance({
                signals: s.signals,
                ...confidence,
                inviteeCalendarConnected: false,
                localHourWarning,
                requiredParticipantCount: requiredIds.length,
                optionalParticipantConflict: s.optionalParticipantConflict,
              }),
            );
          }),
        };
      }
    } else {
      scoredSlots = soloAvailability(selectedHosts, schedulesByUser, busyByUser, baseConfig, window, now);
    }

    const capability = c.req.header("x-calpaca-invitee-calendar");
    const overlay = capability && deps.getInviteeCalendarSession
      ? await deps.getInviteeCalendarSession(capability)
      : null;
    const inviteeBusy = overlay
      ? overlay.busy.flatMap((busy) => {
          try {
            return [{
              start: Temporal.Instant.from(busy.start),
              end: Temporal.Instant.from(busy.end),
            }];
          } catch {
            return [];
          }
        })
      : null;
    const ranked: (ProvenanceSlot & { mutual?: boolean })[] = inviteeBusy
      ? rankByMutualAvailability(scoredSlots, inviteeBusy)
      : scoredSlots;
    const occupancy = capacity > 1 && deps.getEventTypeSlotOccupancy
      ? await deps.getEventTypeSlotOccupancy(eventType.id, window, now)
      : null;
    const rendered = ranked.map((s) => {
      const requiredIds = s.hostUserId
        ? [s.hostUserId]
        : selectedHosts
            .filter((host) => groupHostRole(host.role) === "required")
            .map((host) => host.userId);
      const confidence = confidenceFromEvidence(
        requiredIds.flatMap((id) => {
          const evidence = evidenceByUser.get(id);
          return evidence ? [evidence] : [];
        }),
        requiredIds.length,
      );
      const localHourWarning = isOutsideLocalHours(s.slot.start, inviteeTimezone);
      return renderSlot(
        s.slot,
        s.score,
        inviteeTimezone,
        s.mutual,
        occupancy
          ? Math.max(0, capacity - (occupancy.get(s.slot.start.toString()) ?? 0))
          : undefined,
        recommendationProvenance({
          signals: s.signals,
          ...confidence,
          mutual: s.mutual,
          inviteeCalendarConnected: inviteeBusy !== null,
          localHourWarning,
          requiredParticipantCount: requiredIds.length,
          optionalParticipantConflict: s.optionalParticipantConflict,
        }),
      );
    }).filter((slot) => slot.seatsRemaining === undefined || slot.seatsRemaining > 0);
    const curated = rendered.slice(0, eventType.curatedSlotCount);

    return c.json({
      curated,
      all: rendered,
      ...(quorum ? { quorum } : {}),
      ...(overlay ? { inviteeCalendar: { connected: true, expiresAt: overlay.expiresAt.toISOString() } } : {}),
    });
  });

  return router;
}

export const availabilityRoutes = createAvailabilityRoutes();

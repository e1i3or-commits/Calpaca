import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import {
  getEventTypeBySlug as dbGetEventTypeBySlug,
  getEventTypeHosts as dbGetEventTypeHosts,
  getSchedulesForUsers as dbGetSchedulesForUsers,
  getBusyForUsers as dbGetBusyForUsers,
  type EventTypeConfig,
  type EventTypeHostRecord,
  type HostSchedule,
  type HostBusy,
} from "../../db/availability-repo";
import { expandRules } from "../../core/availability/rules";
import { subtract, type Interval } from "../../core/availability/intervals";
import { generateSlots, type SlotConfig } from "../../core/availability/slots";
import { scoreSlots } from "../../core/availability/scoring";
import { groupAvailability, type GroupHost } from "../../core/availability/group";

/**
 * Repo access the route needs, as plain functions rather than imported
 * module bindings so tests can inject stubs (per task 13: "inject repo
 * functions; do not mock module internals"). `now` is injected for the same
 * reason - minimum notice / rolling window math is time-dependent.
 */
export interface AvailabilityDeps {
  readonly getEventTypeBySlug: (slug: string) => Promise<EventTypeConfig | null>;
  readonly getEventTypeHosts: (eventTypeId: string) => Promise<EventTypeHostRecord[]>;
  readonly getSchedulesForUsers: (userIds: readonly string[]) => Promise<HostSchedule[]>;
  readonly getBusyForUsers: (userIds: readonly string[], window: Interval) => Promise<HostBusy[]>;
  readonly now: () => Temporal.Instant;
}

const defaultDeps: AvailabilityDeps = {
  getEventTypeBySlug: (slug) => dbGetEventTypeBySlug(slug),
  getEventTypeHosts: (eventTypeId) => dbGetEventTypeHosts(eventTypeId),
  getSchedulesForUsers: (userIds) => dbGetSchedulesForUsers(userIds),
  getBusyForUsers: (userIds, window) => dbGetBusyForUsers(userIds, window),
  now: () => Temporal.Now.instant(),
};

const querySchema = z.object({
  eventTypeSlug: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  inviteeTimezone: z.string().min(1),
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
}

const LOCAL_HOUR_MIN = 7;
const LOCAL_HOUR_MAX = 21;

function isOutsideLocalHours(instant: Temporal.Instant, timezone: string): boolean {
  const zdt = instant.toZonedDateTimeISO(timezone);
  const hour = zdt.hour + zdt.minute / 60;
  return hour < LOCAL_HOUR_MIN || hour >= LOCAL_HOUR_MAX;
}

function renderSlot(slot: Interval, score: number, inviteeTimezone: string): SlotDto {
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
  };
}

function slotKey(slot: Interval): string {
  return `${slot.start.toString()}|${slot.end.toString()}`;
}

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
): { slot: Interval; score: number }[] {
  const bestByKey = new Map<string, { slot: Interval; score: number }>();

  for (const host of hosts) {
    const schedule = schedulesByUser.get(host.userId);
    if (!schedule) continue;

    const open = expandRules(schedule.rules, schedule.timezone, window);
    const busy = busyByUser.get(host.userId) ?? [];
    const free = subtract(open, busy);
    const candidates = generateSlots(free, { ...config, timezone: schedule.timezone }, now);
    const scored = scoreSlots(candidates, { busy, open, prefs: {}, timezone: schedule.timezone });

    for (const { slot, score } of scored) {
      const key = slotKey(slot);
      const existing = bestByKey.get(key);
      if (!existing || score > existing.score) {
        bestByKey.set(key, { slot, score });
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

  router.get("/availability", async (c) => {
    const parsedQuery = querySchema.safeParse({
      eventTypeSlug: c.req.query("eventTypeSlug"),
      start: c.req.query("start"),
      end: c.req.query("end"),
      inviteeTimezone: c.req.query("inviteeTimezone"),
    });
    if (!parsedQuery.success) {
      return c.json({ error: "invalid_query", issues: parsedQuery.error.issues }, 400);
    }
    const { eventTypeSlug, start, end, inviteeTimezone } = parsedQuery.data;
    const requestedHosts = c.req.queries("hosts");

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

    const eventType = await deps.getEventTypeBySlug(eventTypeSlug);
    if (!eventType) {
      return c.json({ error: "event_type_not_found" }, 404);
    }

    const isGroup = requestedHosts !== undefined && requestedHosts.length > 0;
    if (isGroup) {
      const disallowed = requestedHosts.filter((id) => !eventType.publicSelectableHostIds.includes(id));
      if (disallowed.length > 0) {
        return c.json({ error: "hosts_not_selectable", hosts: disallowed }, 403);
      }
    }

    const allHosts = await deps.getEventTypeHosts(eventType.id);
    const selectedHosts = isGroup ? allHosts.filter((h) => requestedHosts.includes(h.userId)) : allHosts;

    const userIds = selectedHosts.map((h) => h.userId);
    const [scheduleRows, busyRows] = await Promise.all([
      deps.getSchedulesForUsers(userIds),
      deps.getBusyForUsers(userIds, window),
    ]);
    const schedulesByUser = new Map(scheduleRows.map((s) => [s.userId, s]));
    const busyByUser = new Map(busyRows.map((b) => [b.userId, b.intervals]));

    const now = deps.now();
    const baseConfig: SlotConfig = {
      durationMinutes: eventType.durationMinutes,
      bufferBeforeMin: eventType.bufferBeforeMin,
      bufferAfterMin: eventType.bufferAfterMin,
      minimumNoticeMin: eventType.minimumNoticeMin,
      rollingWindowDays: eventType.rollingWindowDays,
      maxPerDay: eventType.maxPerDay ?? undefined,
      timezone: "UTC",
    };

    let scoredSlots: { slot: Interval; score: number }[];
    if (isGroup) {
      const groupHosts: GroupHost[] = selectedHosts.flatMap((host) => {
        const schedule = schedulesByUser.get(host.userId);
        if (!schedule) return [];
        return [
          {
            userId: host.userId,
            open: expandRules(schedule.rules, schedule.timezone, window),
            busy: busyByUser.get(host.userId) ?? [],
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
      scoredSlots = [...groupAvailability(groupHosts, groupConfig, now).full];
    } else {
      scoredSlots = soloAvailability(selectedHosts, schedulesByUser, busyByUser, baseConfig, window, now);
    }

    const rendered = scoredSlots.map((s) => renderSlot(s.slot, s.score, inviteeTimezone));
    const curated = rendered.slice(0, eventType.curatedSlotCount);

    return c.json({ curated, all: rendered });
  });

  return router;
}

export const availabilityRoutes = createAvailabilityRoutes();

import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import { getEventTypeForAdmin } from "../../db/admin-repo";
import {
  getCapacityAwareBusyForUsers,
  getSchedulesForUsers,
} from "../../db/availability-repo";
import { diagnoseHostAvailability } from "../../core/availability/troubleshoot";
import { forwardingIntervals } from "../../core/availability/overrides";
import { isAllowedDuration } from "../../core/booking/durations";

const bodySchema = z.object({
  eventTypeId: z.string().uuid(),
  start: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480),
});

export const availabilityTroubleshooterRoutes = new Hono<AuthEnv>();
availabilityTroubleshooterRoutes.use("/api/me/availability-troubleshooter", requireSession);

availabilityTroubleshooterRoutes.post("/api/me/availability-troubleshooter", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const user = c.get("user");
  if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
  const eventType = await getEventTypeForAdmin(
    parsed.data.eventTypeId,
    user.id,
    undefined,
    user.workspaceId,
  );
  if (!eventType) return c.json({ error: "event_type_not_found" }, 404);
  if (!isAllowedDuration(
    parsed.data.durationMinutes,
    eventType.durationMinutes,
    eventType.selectableDurations,
  )) return c.json({ error: "invalid_duration" }, 400);

  const start = Temporal.Instant.from(parsed.data.start);
  const end = start.add({ minutes: parsed.data.durationMinutes });
  const slot = { start, end };
  const hostIds = eventType.hosts.map((host) => host.userId);
  const schedules = await getSchedulesForUsers(hostIds);
  const schedulesByUser = new Map(schedules.map((schedule) => [schedule.userId, schedule]));
  const window = {
    start: start.subtract({ minutes: eventType.bufferBeforeMin }),
    end: end.add({ minutes: eventType.bufferAfterMin }),
  };
  const scheduleUserIds = schedules.map((schedule) => schedule.userId);
  const busyRows = await getCapacityAwareBusyForUsers(
    scheduleUserIds,
    window,
    eventType.id,
    eventType.capacity ?? 1,
  );
  const busyByUser = new Map(busyRows.map((row) => [row.userId, row.intervals]));
  const now = Temporal.Now.instant();
  const diagnoseUser = (userId: string, visited = new Set<string>()) => {
    const diagnostic = diagnoseHostAvailability({
      userId,
      schedule: schedulesByUser.get(userId),
      busy: busyByUser.get(userId) ?? [],
      slot,
      bufferBeforeMin: eventType.bufferBeforeMin,
      bufferAfterMin: eventType.bufferAfterMin,
      minimumNoticeMin: eventType.minimumNoticeMin,
      rollingWindowDays: eventType.rollingWindowDays,
      now,
    });
    const schedule = schedulesByUser.get(userId);
    if (diagnostic.available || !schedule || visited.has(userId)) return diagnostic;
    const padded = {
      start: slot.start.subtract({ minutes: eventType.bufferBeforeMin }),
      end: slot.end.add({ minutes: eventType.bufferAfterMin }),
    };
    for (const targetUserId of new Set((schedule.overrides ?? []).flatMap((override) =>
      override.forwardToUserId ? [override.forwardToUserId] : []
    ))) {
      const coversSlot = forwardingIntervals(
        schedule.overrides ?? [],
        schedule.timezone,
        targetUserId,
        padded,
      ).some((interval) =>
        Temporal.Instant.compare(interval.start, padded.start) <= 0
        && Temporal.Instant.compare(padded.end, interval.end) <= 0
      );
      if (!coversSlot) continue;
      const target = diagnoseUser(targetUserId, new Set(visited).add(userId));
      if (target.available) {
        return { userId, available: true as const, reason: "forwarded_available" as const };
      }
    }
    return diagnostic;
  };
  const hosts = eventType.hosts.map((host) => ({
    name: host.name,
    role: host.role,
    ...diagnoseUser(host.userId),
  }));
  const required = hosts.filter((host) => host.role !== "optional");
  const available = eventType.mode === "group"
    ? required.length > 0 && required.every((host) => host.available)
    : hosts.some((host) => host.available);

  return c.json({
    available,
    start: start.toString(),
    end: end.toString(),
    hosts,
  });
});

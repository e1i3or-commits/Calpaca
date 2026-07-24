import { Temporal } from "@js-temporal/polyfill";
import { effectiveOpenIntervals } from "./overrides";
import { expandRules } from "./rules";
import type { Interval } from "./intervals";
import type { HostSchedule } from "../../db/availability-repo";

export type AvailabilityReason =
  | "available"
  | "schedule_missing"
  | "outside_working_hours"
  | "time_off"
  | "calendar_conflict"
  | "minimum_notice"
  | "rolling_window"
  | "buffer_outside_hours"
  | "forwarded_available";

export interface HostDiagnostic {
  readonly userId: string;
  readonly available: boolean;
  readonly reason: AvailabilityReason;
}

function contains(intervals: readonly Interval[], target: Interval): boolean {
  return intervals.some((interval) =>
    Temporal.Instant.compare(interval.start, target.start) <= 0
    && Temporal.Instant.compare(target.end, interval.end) <= 0
  );
}

function overlaps(left: Interval, right: Interval): boolean {
  return Temporal.Instant.compare(left.start, right.end) < 0
    && Temporal.Instant.compare(right.start, left.end) < 0;
}

export function diagnoseHostAvailability(input: {
  readonly userId: string;
  readonly schedule?: HostSchedule;
  readonly busy: readonly Interval[];
  readonly slot: Interval;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly now: Temporal.Instant;
}): HostDiagnostic {
  const { slot, now } = input;
  if (!input.schedule) {
    return { userId: input.userId, available: false, reason: "schedule_missing" };
  }
  if (Temporal.Instant.compare(slot.start, now.add({ minutes: input.minimumNoticeMin })) < 0) {
    return { userId: input.userId, available: false, reason: "minimum_notice" };
  }
  const windowEnd = now.toZonedDateTimeISO(input.schedule.timezone)
    .add({ days: input.rollingWindowDays }).toInstant();
  if (Temporal.Instant.compare(slot.start, windowEnd) >= 0) {
    return { userId: input.userId, available: false, reason: "rolling_window" };
  }

  const padded = {
    start: slot.start.subtract({ minutes: input.bufferBeforeMin }),
    end: slot.end.add({ minutes: input.bufferAfterMin }),
  };
  const recurring = expandRules(input.schedule.rules, input.schedule.timezone, padded);
  const effective = effectiveOpenIntervals(
    input.schedule.rules,
    input.schedule.overrides ?? [],
    input.schedule.timezone,
    padded,
  );
  if (!contains(effective, slot)) {
    return {
      userId: input.userId,
      available: false,
      reason: contains(recurring, slot) ? "time_off" : "outside_working_hours",
    };
  }
  if (!contains(effective, padded)) {
    return { userId: input.userId, available: false, reason: "buffer_outside_hours" };
  }
  if (input.busy.some((interval) => overlaps(interval, padded))) {
    return { userId: input.userId, available: false, reason: "calendar_conflict" };
  }
  return { userId: input.userId, available: true, reason: "available" };
}

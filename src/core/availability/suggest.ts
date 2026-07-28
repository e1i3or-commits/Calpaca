/**
 * "Give me the best N open times in this window" — the pipeline behind every
 * suggestion surface (meeting polls, one-off offers).
 *
 * This is the same expand -> subtract -> discretize -> score pipeline the
 * booking path uses, stopped one step earlier: it returns ranked candidates
 * instead of a full slot wall. It exists as a shared function because the
 * alternative is each caller re-assembling five core calls in the right order,
 * and a caller that gets the order wrong produces times the host is not
 * actually free for.
 */

import { Temporal } from "@js-temporal/polyfill";
import { effectiveOpenIntervals, type ScheduleOverride } from "./overrides";
import { intersectMany, subtract, type Interval } from "./intervals";
import { generateSlots } from "./slots";
import { scoreSlots, type HostPrefs } from "./scoring";
import type { WeeklyRule } from "./rules";

/** Longest range a single suggestion request may scan. Bounds the work: the
 * per-day windows below are expanded one interval per day. */
export const MAX_SUGGESTION_RANGE_DAYS = 30;

export interface SuggestionWindowInput {
  readonly timezone: string;
  /** ISO dates, inclusive. */
  readonly startDate: string;
  readonly endDate: string;
  /** "HH:MM" wall-clock bounds applied to each day, in `timezone`. */
  readonly dailyStart: string;
  readonly dailyEnd: string;
}

/**
 * Expands a date range plus a time-of-day window into one interval per day.
 *
 * Per-day rather than one big interval because "09:00-17:00 next week" must not
 * offer 2am Wednesday, and because a fixed UTC offset would drift across a DST
 * transition inside the range. Throws RangeError on an unusable request.
 */
export function suggestionWindow(
  input: SuggestionWindowInput,
): { window: Interval; dailyWindows: Interval[] } {
  const startDate = Temporal.PlainDate.from(input.startDate);
  const endDate = Temporal.PlainDate.from(input.endDate);
  if (Temporal.PlainDate.compare(startDate, endDate) > 0) throw new RangeError("invalid date range");
  if (startDate.until(endDate, { largestUnit: "day" }).days > MAX_SUGGESTION_RANGE_DAYS) {
    throw new RangeError("date range too large");
  }
  const dailyStart = Temporal.PlainTime.from(input.dailyStart);
  const dailyEnd = Temporal.PlainTime.from(input.dailyEnd);
  if (Temporal.PlainTime.compare(dailyStart, dailyEnd) >= 0) throw new RangeError("invalid daily window");

  const dailyWindows: Interval[] = [];
  for (
    let date = startDate;
    Temporal.PlainDate.compare(date, endDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    dailyWindows.push({
      start: date.toPlainDateTime(dailyStart)
        .toZonedDateTime(input.timezone, { disambiguation: "compatible" }).toInstant(),
      end: date.toPlainDateTime(dailyEnd)
        .toZonedDateTime(input.timezone, { disambiguation: "compatible" }).toInstant(),
    });
  }
  return {
    window: {
      start: dailyWindows[0]!.start,
      end: dailyWindows[dailyWindows.length - 1]!.end,
    },
    dailyWindows,
  };
}

/** Structurally satisfied by the repo's HostSchedule; declared here so the
 * core keeps its no-database-imports rule. */
export interface SuggestionSchedule {
  readonly timezone: string;
  readonly rules: readonly WeeklyRule[];
  readonly overrides?: readonly ScheduleOverride[];
}

export interface SuggestionConstraints {
  /** Outer bound to search. */
  readonly window: Interval;
  /** Per-day time-of-day windows ("09:00-17:00" expanded across the range),
   * already in the requester's zone. Empty means no time-of-day restriction. */
  readonly dailyWindows: readonly Interval[];
  readonly durationMinutes: number;
  /** How many suggestions to return, best first. */
  readonly count: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly slotIncrementMin: number;
  readonly maxPerDay?: number;
  /** Zone the slot grid is aligned to. Distinct from the schedule's zone
   * because dailyWindows are expressed in the requester's zone, and a grid
   * aligned to the wrong zone lands slots off the requested boundaries. */
  readonly slotTimezone?: string;
  readonly prefs?: HostPrefs;
  /** Guard for generateSlots; the window above is the real bound. */
  readonly rollingWindowDays?: number;
  /**
   * Minimum gap between two returned suggestions. Adjacent slots score almost
   * identically, so an unspread top-N is "12:30, 12:45, 1:00" — overlapping
   * times that read as one option, not three. Zero keeps the raw ranking.
   */
  readonly minSeparationMinutes?: number;
  /** Take at most one suggestion per local day before allowing a second on a
   * day already used. A handful of times to choose from is only useful if they
   * are not all the same afternoon. */
  readonly preferDistinctDays?: boolean;
}

/**
 * Greedy spread over the ranked list: walk best-first, keep a slot only if it
 * clears `minSeparationMinutes` from everything kept so far, preferring a
 * fresh day on the first pass and relaxing that on the second.
 *
 * Greedy rather than optimal on purpose. The host is glancing at three or four
 * times before pasting them, so "best available, well separated" beats any
 * globally optimal arrangement they would not notice.
 */
function spreadSlots(
  ranked: readonly Interval[],
  count: number,
  minSeparationMinutes: number,
  preferDistinctDays: boolean,
  timezone: string,
): Interval[] {
  const localDay = (slot: Interval) =>
    slot.start.toZonedDateTimeISO(timezone).toPlainDate().toString();

  const picked: Interval[] = [];
  const usedDays = new Set<string>();

  const clears = (slot: Interval) => picked.every((kept) => {
    const gap = Temporal.Instant.compare(slot.start, kept.start) < 0
      ? slot.end.until(kept.start).total({ unit: "minutes" })
      : kept.end.until(slot.start).total({ unit: "minutes" });
    return gap >= minSeparationMinutes;
  });

  for (const requireNewDay of preferDistinctDays ? [true, false] : [false]) {
    for (const slot of ranked) {
      if (picked.length >= count) break;
      if (picked.includes(slot)) continue;
      if (requireNewDay && usedDays.has(localDay(slot))) continue;
      if (!clears(slot)) continue;
      picked.push(slot);
      usedDays.add(localDay(slot));
    }
    if (picked.length >= count) break;
  }

  // Ranked order is by score; chronological is what a recipient reads.
  return picked.sort((a, b) => Temporal.Instant.compare(a.start, b.start));
}

/**
 * Ranked open slots, best first, capped at `count`.
 *
 * Busy time is subtracted before discretizing rather than filtered after, so a
 * suggestion can never land on top of an existing commitment. Scoring runs
 * against the same `open` set the candidates came from — the fragmentation
 * penalty is meaningless otherwise.
 */
export function suggestOpenSlots(
  schedule: SuggestionSchedule,
  busy: readonly Interval[],
  constraints: SuggestionConstraints,
  now: Temporal.Instant,
): Interval[] {
  if (constraints.count <= 0) return [];

  const free = subtract(
    effectiveOpenIntervals(
      schedule.rules,
      schedule.overrides ?? [],
      schedule.timezone,
      constraints.window,
    ),
    busy,
  );
  // An empty dailyWindows list means "any time of day"; intersecting with it
  // would instead mean "no time of day".
  const open = constraints.dailyWindows.length
    ? intersectMany([free, constraints.dailyWindows])
    : free;

  const candidates = generateSlots(open, {
    durationMinutes: constraints.durationMinutes,
    bufferBeforeMin: constraints.bufferBeforeMin,
    bufferAfterMin: constraints.bufferAfterMin,
    minimumNoticeMin: constraints.minimumNoticeMin,
    rollingWindowDays: constraints.rollingWindowDays ?? 366,
    slotIncrementMin: constraints.slotIncrementMin,
    maxPerDay: constraints.maxPerDay,
    timezone: constraints.slotTimezone ?? schedule.timezone,
  }, now);

  const ranked = scoreSlots(candidates, {
    busy,
    open,
    prefs: constraints.prefs ?? {},
    timezone: schedule.timezone,
  }).map(({ slot }) => slot);

  const separation = constraints.minSeparationMinutes ?? 0;
  if (separation <= 0 && !constraints.preferDistinctDays) {
    return ranked.slice(0, constraints.count);
  }
  return spreadSlots(
    ranked,
    constraints.count,
    separation,
    constraints.preferDistinctDays ?? false,
    constraints.slotTimezone ?? schedule.timezone,
  );
}

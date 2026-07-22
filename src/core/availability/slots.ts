import { Temporal } from "@js-temporal/polyfill";
import { normalize, type Interval } from "./intervals";

/**
 * Event-type-declared slot generation config, per docs/SCHEMA.md `event_types`.
 * `timezone` is the event type's declared zone: `maxPerDay` is enforced against
 * calendar days in this zone, not UTC, so a host in a non-UTC zone gets the
 * per-day cap they actually configured.
 */
export interface SlotConfig {
  readonly durationMinutes: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minimumNoticeMin: number;
  readonly rollingWindowDays: number;
  readonly maxPerDay?: number;
  readonly slotIncrementMin?: number;
  readonly timezone: string;
}

const DEFAULT_INCREMENT_MIN = 15;
const MINUTES_PER_DAY = 24 * 60;

function fitsWithBuffers(
  slotStart: Temporal.Instant,
  slotEnd: Temporal.Instant,
  open: readonly Interval[],
  bufferBeforeMin: number,
  bufferAfterMin: number,
): boolean {
  const paddedStart = slotStart.subtract({ minutes: bufferBeforeMin });
  const paddedEnd = slotEnd.add({ minutes: bufferAfterMin });
  return open.some(
    (o) =>
      Temporal.Instant.compare(o.start, paddedStart) <= 0 &&
      Temporal.Instant.compare(paddedEnd, o.end) <= 0,
  );
}

/** Caps candidates at `maxPerDay` per calendar day in `timezone`, earliest slots first. */
function applyMaxPerDay(
  slots: readonly Interval[],
  timezone: string,
  maxPerDay: number | undefined,
): Interval[] {
  if (maxPerDay == null) return [...slots];

  const countByDate = new Map<string, number>();
  const result: Interval[] = [];
  for (const slot of slots) {
    const dateKey = slot.start.toZonedDateTimeISO(timezone).toPlainDate().toString();
    const count = countByDate.get(dateKey) ?? 0;
    if (count >= maxPerDay) continue;
    countByDate.set(dateKey, count + 1);
    result.push(slot);
  }
  return result;
}

/**
 * Generates candidate slots from open intervals (already busy-subtracted) and
 * event type config. Slots are discretized on a fixed `slotIncrementMin` grid
 * anchored to local midnight in `config.timezone`, not to the open intervals'
 * own boundaries — so a busy block that ends off-grid (e.g. 09:07) does not
 * shift the candidate grid, it just rules out the marks it overlaps.
 */
export function generateSlots(
  open: readonly Interval[],
  config: SlotConfig,
  now: Temporal.Instant,
): Interval[] {
  const normalizedOpen = normalize(open);
  if (normalizedOpen.length === 0) return [];

  const timezone = config.timezone;
  const incrementMin = config.slotIncrementMin ?? DEFAULT_INCREMENT_MIN;
  const noticeThreshold = now.add({ minutes: config.minimumNoticeMin });
  const windowEnd = now
    .toZonedDateTimeISO(timezone)
    .add({ days: config.rollingWindowDays })
    .toInstant();

  const startDate = normalizedOpen[0]!.start.toZonedDateTimeISO(timezone).toPlainDate();
  const endDate = normalizedOpen[normalizedOpen.length - 1]!.end
    .toZonedDateTimeISO(timezone)
    .toPlainDate();

  const candidates: Interval[] = [];

  for (
    let date = startDate;
    Temporal.PlainDate.compare(date, endDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    for (let minuteOfDay = 0; minuteOfDay < MINUTES_PER_DAY; minuteOfDay += incrementMin) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const slotStart = date
        .toPlainDateTime({ hour, minute })
        .toZonedDateTime(timezone, { disambiguation: "compatible" })
        .toInstant();
      const slotEnd = slotStart.add({ minutes: config.durationMinutes });

      if (Temporal.Instant.compare(slotStart, noticeThreshold) < 0) continue;
      if (Temporal.Instant.compare(slotStart, windowEnd) >= 0) continue;
      if (!fitsWithBuffers(slotStart, slotEnd, normalizedOpen, config.bufferBeforeMin, config.bufferAfterMin)) {
        continue;
      }

      candidates.push({ start: slotStart, end: slotEnd });
    }
  }

  return applyMaxPerDay(candidates, timezone, config.maxPerDay);
}

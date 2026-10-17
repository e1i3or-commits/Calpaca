import { Temporal } from "@js-temporal/polyfill";

export interface Interval {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

function isBefore(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) < 0;
}

function isAfter(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) > 0;
}

function max(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return isAfter(a, b) ? a : b;
}

function min(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return isBefore(a, b) ? a : b;
}

/** Sorts by start, then merges overlapping and touching (end === next.start) intervals. */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const valid = intervals.filter((iv) => isBefore(iv.start, iv.end));
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => Temporal.Instant.compare(a.start, b.start));

  const result: Interval[] = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (isBefore(current.end, next.start)) {
      result.push(current);
      current = next;
    } else {
      current = { start: current.start, end: max(current.end, next.end) };
    }
  }
  result.push(current);
  return result;
}

/** Removes every busy interval from every open interval. Both inputs are normalized first. */
export function subtract(open: readonly Interval[], busy: readonly Interval[]): Interval[] {
  const openNorm = normalize(open);
  const busyNorm = normalize(busy);
  const result: Interval[] = [];

  for (const o of openNorm) {
    let cursor = o.start;
    for (const b of busyNorm) {
      if (!isAfter(b.end, cursor) || !isBefore(b.start, o.end)) continue;

      const bStart = max(b.start, cursor);
      if (isBefore(cursor, bStart)) {
        result.push({ start: cursor, end: min(bStart, o.end) });
      }
      cursor = max(cursor, min(b.end, o.end));
      if (!isBefore(cursor, o.end)) break;
    }
    if (isBefore(cursor, o.end)) {
      result.push({ start: cursor, end: o.end });
    }
  }
  return result;
}

function intersectPair(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!;
    const y = b[j]!;
    const start = max(x.start, y.start);
    const end = min(x.end, y.end);
    if (isBefore(start, end)) {
      result.push({ start, end });
    }
    if (isBefore(x.end, y.end)) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

/** Intersection across every set (e.g. group booking with N required hosts). Any empty set yields []. */
export function intersectMany(sets: readonly (readonly Interval[])[]): Interval[] {
  if (sets.length === 0) return [];

  let acc = normalize(sets[0]!);
  for (let i = 1; i < sets.length && acc.length > 0; i++) {
    acc = intersectPair(acc, normalize(sets[i]!));
  }
  return acc;
}

/** Restricts intervals to the given window, dropping or truncating anything outside it. */
export function clamp(intervals: readonly Interval[], window: Interval): Interval[] {
  const result: Interval[] = [];
  for (const iv of normalize(intervals)) {
    const start = max(iv.start, window.start);
    const end = min(iv.end, window.end);
    if (isBefore(start, end)) {
      result.push({ start, end });
    }
  }
  return result;
}

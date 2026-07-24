import { Temporal } from "@js-temporal/polyfill";
import { normalize, type Interval } from "./intervals";

/** A recurring weekly focus-block window, per docs/SCHEMA.md `users.prefs.focusBlocks`. */
export interface FocusBlock {
  readonly dow: number;
  readonly start: string;
  readonly end: string;
}

/** Per-host scoring preferences, per docs/SCHEMA.md `users.prefs`. */
export interface HostPrefs {
  readonly morningWeight?: number;
  readonly adjacencyBonus?: boolean;
  readonly focusBlocks?: readonly FocusBlock[];
}

export interface ScoringContext {
  readonly busy: readonly Interval[];
  readonly open: readonly Interval[];
  readonly prefs: HostPrefs;
  readonly timezone: string;
}

export interface ScoredSlot {
  readonly slot: Interval;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly signals: ScoringSignals;
}

export interface ScoringSignals {
  readonly fragmentationPenalty: number;
  readonly consumesBlockEdge: boolean;
  readonly adjacencyBonus: number;
  readonly timeOfDayScore: number;
  readonly focusBlockPenalty: number;
}

/** Weighted-sum coefficients for combining the individual signals below. */
export const SCORING_WEIGHTS = {
  fragmentation: 2,
  adjacency: 1,
  timeOfDay: 1,
  focusBlock: 3,
} as const;

function diffMinutes(a: Temporal.Instant, b: Temporal.Instant): number {
  return (b.epochMilliseconds - a.epochMilliseconds) / 60_000;
}

/**
 * Penalizes candidates that split an open block in two, leaving unused time
 * on both sides. Consuming an edge (nothing left on one side) never scores
 * a penalty, regardless of block size.
 */
export function fragmentationPenalty(slot: Interval, open: readonly Interval[]): number {
  const container = open.find(
    (o) =>
      Temporal.Instant.compare(o.start, slot.start) <= 0 &&
      Temporal.Instant.compare(slot.end, o.end) <= 0,
  );
  if (!container) return 0;

  const leftoverBefore = diffMinutes(container.start, slot.start);
  const leftoverAfter = diffMinutes(slot.end, container.end);
  return leftoverBefore > 0 && leftoverAfter > 0 ? 1 : 0;
}

/** Rewards candidates that touch an existing busy interval, consolidating free time. */
export function adjacencyBonus(slot: Interval, busy: readonly Interval[]): number {
  const touches = busy.some((b) => b.end.equals(slot.start) || slot.end.equals(b.start));
  return touches ? 1 : 0;
}

/**
 * Favors morning slots in the host's own zone, peaking at 9am and tapering
 * off linearly over 12 hours in either direction. `morningWeight` (default 1)
 * scales the whole signal, so a host who doesn't care about time of day can
 * set it to 0.
 */
export function timeOfDay(slot: Interval, timezone: string, morningWeight = 1): number {
  const zdt = slot.start.toZonedDateTimeISO(timezone);
  const hour = zdt.hour + zdt.minute / 60;
  const base = Math.max(0, 1 - Math.abs(hour - 9) / 12);
  return base * morningWeight;
}

function isWithinFocusBlock(slot: Interval, block: FocusBlock, timezone: string): boolean {
  const startZdt = slot.start.toZonedDateTimeISO(timezone);
  if (startZdt.dayOfWeek !== block.dow) return false;

  const date = startZdt.toPlainDate();
  const blockStart = date
    .toPlainDateTime(Temporal.PlainTime.from(block.start))
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant();
  const blockEnd = date
    .toPlainDateTime(Temporal.PlainTime.from(block.end))
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant();

  return (
    Temporal.Instant.compare(slot.start, blockStart) >= 0 &&
    Temporal.Instant.compare(slot.end, blockEnd) <= 0
  );
}

/**
 * Near-zero score for candidates fully inside a focus block. The penalty
 * relaxes (scales down) when there are fewer than 5 total candidates, so a
 * sparse day doesn't hide every slot behind an unusable focus block.
 */
export function focusBlockPenalty(
  slot: Interval,
  focusBlocks: readonly FocusBlock[],
  timezone: string,
  candidateCount: number,
): number {
  const inside = focusBlocks.some((block) => isWithinFocusBlock(slot, block, timezone));
  if (!inside) return 0;
  return candidateCount < 5 ? candidateCount / 5 : 1;
}

/**
 * Ranks candidate slots by a weighted sum of the signals above. Ties (equal
 * score) break by earlier start, so output order is fully deterministic for
 * a given input.
 */
export function scoreSlots(slots: readonly Interval[], context: ScoringContext): ScoredSlot[] {
  const busy = normalize(context.busy);
  const open = normalize(context.open);
  const morningWeight = context.prefs.morningWeight ?? 1;
  const adjacencyEnabled = context.prefs.adjacencyBonus ?? true;
  const focusBlocks = context.prefs.focusBlocks ?? [];
  const candidateCount = slots.length;

  const scored = slots.map((slot) => {
    const reasons: string[] = [];

    const fragPenalty = fragmentationPenalty(slot, open);
    reasons.push(fragPenalty > 0 ? "splits an open block" : "consumes a block edge");

    const adjBonus = adjacencyEnabled ? adjacencyBonus(slot, busy) : 0;
    if (adjBonus > 0) reasons.push("adjacent to existing busy time");

    const todScore = timeOfDay(slot, context.timezone, morningWeight);
    if (todScore > 0) reasons.push("favorable time of day");

    const focusPenalty = focusBlockPenalty(slot, focusBlocks, context.timezone, candidateCount);
    if (focusPenalty > 0) {
      reasons.push(focusPenalty < 1 ? "inside focus block (relaxed)" : "inside focus block");
    }

    const score =
      SCORING_WEIGHTS.adjacency * adjBonus +
      SCORING_WEIGHTS.timeOfDay * todScore -
      SCORING_WEIGHTS.fragmentation * fragPenalty -
      SCORING_WEIGHTS.focusBlock * focusPenalty;

    return {
      slot,
      score,
      reasons,
      signals: {
        fragmentationPenalty: fragPenalty,
        consumesBlockEdge: fragPenalty === 0,
        adjacencyBonus: adjBonus,
        timeOfDayScore: todScore,
        focusBlockPenalty: focusPenalty,
      },
    };
  });

  return scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Temporal.Instant.compare(a.slot.start, b.slot.start);
  });
}

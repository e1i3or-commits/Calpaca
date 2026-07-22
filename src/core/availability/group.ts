import { Temporal } from "@js-temporal/polyfill";
import { intersectMany, subtract, type Interval } from "./intervals";
import { generateSlots, type SlotConfig } from "./slots";
import { scoreSlots, type HostPrefs } from "./scoring";

export type HostRole = "required" | "optional";

/** One participant in a group booking; open/busy are the host's own working
 * hours and calendar busy, per docs/SCHEMA.md. */
export interface GroupHost {
  readonly userId: string;
  readonly open: readonly Interval[];
  readonly busy: readonly Interval[];
  readonly role: HostRole;
  readonly prefs: HostPrefs;
  readonly timezone: string;
}

export interface GroupScoredSlot {
  readonly slot: Interval;
  readonly score: number;
}

export interface QuorumFallback {
  readonly missingUserId: string;
  readonly slots: readonly GroupScoredSlot[];
}

export interface GroupAvailabilityResult {
  readonly full: readonly GroupScoredSlot[];
  readonly fallback: readonly QuorumFallback[];
}

/**
 * Discount applied to an optional host's contribution to a slot's average
 * score when the slot conflicts with their busy time. Fixed and unconditional
 * (rather than excluding the host from the average) so a slot every optional
 * can make always outscores one where an optional can't, regardless of the
 * sign of that host's other scoring signals.
 */
export const OPTIONAL_CONFLICT_PENALTY = 2;

function slotKey(slot: Interval): string {
  return `${slot.start.toString()}|${slot.end.toString()}`;
}

function isFreeForHost(slot: Interval, host: GroupHost): boolean {
  const free = subtract(host.open, host.busy);
  return free.some(
    (f) =>
      Temporal.Instant.compare(f.start, slot.start) <= 0 &&
      Temporal.Instant.compare(slot.end, f.end) <= 0,
  );
}

function scoreForHost(candidates: readonly Interval[], host: GroupHost): Map<string, number> {
  const ranked = scoreSlots(candidates, {
    busy: host.busy,
    open: host.open,
    prefs: host.prefs,
    timezone: host.timezone,
  });
  return new Map(ranked.map((r) => [slotKey(r.slot), r.score]));
}

/** Averages per-host scores (task 08) across every host in the group, discounting
 * optional hosts who conflict with the candidate slot. */
function scoreGroupSlots(
  candidates: readonly Interval[],
  required: readonly GroupHost[],
  optional: readonly GroupHost[],
): GroupScoredSlot[] {
  if (candidates.length === 0) return [];

  const requiredScoreMaps = required.map((h) => scoreForHost(candidates, h));
  const optionalScoreMaps = optional.map((h) => scoreForHost(candidates, h));

  const scored = candidates.map((slot) => {
    const key = slotKey(slot);
    const contributions = requiredScoreMaps.map((m) => m.get(key)!);

    optional.forEach((host, i) => {
      const base = optionalScoreMaps[i]!.get(key)!;
      contributions.push(isFreeForHost(slot, host) ? base : base - OPTIONAL_CONFLICT_PENALTY);
    });

    const score = contributions.reduce((a, b) => a + b, 0) / contributions.length;
    return { slot, score };
  });

  return scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Temporal.Instant.compare(a.slot.start, b.slot.start);
  });
}

function bestScore(fallback: QuorumFallback): number {
  return fallback.slots[0]!.score;
}

/**
 * Combined availability for a group of hosts. Required hosts gate
 * eligibility (intersection of free sets); optional hosts only affect
 * scoring. When the full required intersection produces zero slots in the
 * window, falls back to the best leave-one-out subset per required host,
 * ranked by slot quality, so the caller can offer "everyone but X is free
 * then."
 */
export function groupAvailability(
  hosts: readonly GroupHost[],
  config: SlotConfig,
  now: Temporal.Instant,
): GroupAvailabilityResult {
  const required = hosts.filter((h) => h.role === "required");
  const optional = hosts.filter((h) => h.role === "optional");

  const requiredFree = required.map((h) => subtract(h.open, h.busy));
  const fullCandidates = generateSlots(intersectMany(requiredFree), config, now);
  const full = scoreGroupSlots(fullCandidates, required, optional);

  if (full.length > 0 || required.length < 2) {
    return { full, fallback: [] };
  }

  const fallback = required
    .map((missing): QuorumFallback => {
      const remaining = required.filter((h) => h.userId !== missing.userId);
      const remainingFree = remaining.map((h) => subtract(h.open, h.busy));
      const candidates = generateSlots(intersectMany(remainingFree), config, now);
      return { missingUserId: missing.userId, slots: scoreGroupSlots(candidates, remaining, optional) };
    })
    .filter((f) => f.slots.length > 0)
    .sort((a, b) => bestScore(b) - bestScore(a));

  return { full: [], fallback };
}

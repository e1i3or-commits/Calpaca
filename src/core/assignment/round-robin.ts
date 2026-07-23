import { Temporal } from "@js-temporal/polyfill";
import { subtract, type Interval } from "../availability/intervals";
import { generateSlots, type SlotConfig } from "../availability/slots";

/**
 * One member of a round robin pool. `open`/`busy` are the member's own
 * working-hours and calendar busy, per docs/SCHEMA.md. `weight` mirrors
 * `event_type_hosts.weight` (100 = baseline share); `available` is the OOO
 * flag, distinct from calendar busy — an OOO member is excluded from both
 * availability and assignment entirely, not just scored down.
 */
export interface TeamMember {
  readonly userId: string;
  readonly open: readonly Interval[];
  readonly busy: readonly Interval[];
  readonly weight: number;
  readonly available: boolean;
}

/** A team-wide candidate slot and the members who are individually free for it. */
export interface TeamSlot {
  readonly slot: Interval;
  readonly memberIds: readonly string[];
}

/** A past booking, for computing load and recency at assignment time. */
export interface BookingRecord {
  readonly userId: string;
  readonly bookedAt: Temporal.Instant;
}

/** A candidate considered for assignment: pool membership plus their weight. */
export interface AssignmentCandidate {
  readonly userId: string;
  readonly weight: number;
}

/** A ranked candidate with the load computation that produced its rank. */
export interface RankedCandidate {
  readonly userId: string;
  readonly bookingCount: number;
  readonly effectiveLoad: number;
  readonly lastBookedAt: Temporal.Instant | null;
}

export type AssignmentReason =
  | "only_available_candidate"
  | "lowest_effective_load"
  | "least_recently_booked"
  | "stable_user_id_tiebreak";

/** JSON-safe snapshot persisted at assignment time so later load changes
 * cannot rewrite the explanation shown to an administrator. */
export interface AssignmentExplanation {
  readonly winnerUserId: string;
  readonly reason: AssignmentReason;
  readonly candidates: readonly {
    readonly userId: string;
    readonly bookingCount: number;
    readonly effectiveLoad: number;
    readonly lastBookedAt: string | null;
  }[];
}

function slotKey(slot: Interval): string {
  return `${slot.start.toString()}|${slot.end.toString()}`;
}

/**
 * Team-wide availability: per-member slot generation (own open/busy, own
 * config), unioned so a slot is offered if ANY member can take it. This is
 * the deliberate inverse of picking a host first and showing only their
 * slots — unavailable (OOO) members are simply excluded from the per-member
 * pass, so their absence never removes a slot another member can still take.
 */
export function teamAvailability(
  members: readonly TeamMember[],
  config: SlotConfig,
  now: Temporal.Instant,
): TeamSlot[] {
  const bySlot = new Map<string, { slot: Interval; memberIds: string[] }>();

  for (const member of members) {
    if (!member.available) continue;

    const free = subtract(member.open, member.busy);
    const slots = generateSlots(free, config, now);

    for (const slot of slots) {
      const key = slotKey(slot);
      const existing = bySlot.get(key);
      if (existing) {
        existing.memberIds.push(member.userId);
      } else {
        bySlot.set(key, { slot, memberIds: [member.userId] });
      }
    }
  }

  return [...bySlot.values()].sort((a, b) => Temporal.Instant.compare(a.slot.start, b.slot.start));
}

function computeLoad(candidate: AssignmentCandidate, history: readonly BookingRecord[]): RankedCandidate {
  const bookings = history.filter((b) => b.userId === candidate.userId);
  const bookingCount = bookings.length;
  const lastBookedAt = bookings.reduce<Temporal.Instant | null>((latest, b) => {
    if (latest === null || Temporal.Instant.compare(b.bookedAt, latest) > 0) return b.bookedAt;
    return latest;
  }, null);

  return {
    userId: candidate.userId,
    bookingCount,
    effectiveLoad: bookingCount / (candidate.weight / 100),
    lastBookedAt,
  };
}

/**
 * Orders candidates by weighted least-recently-booked: lowest effective load
 * (bookingCount / (weight/100)) first. Ties break by longest time since last
 * booking (never-booked beats any booked), then by userId for a fully
 * deterministic, stable order.
 */
function rank(candidates: readonly AssignmentCandidate[], history: readonly BookingRecord[]): RankedCandidate[] {
  const loads = candidates.map((c) => computeLoad(c, history));

  return loads.sort((a, b) => {
    if (a.effectiveLoad !== b.effectiveLoad) return a.effectiveLoad - b.effectiveLoad;

    if (a.lastBookedAt === null || b.lastBookedAt === null) {
      if (a.lastBookedAt === null && b.lastBookedAt === null) return a.userId < b.userId ? -1 : 1;
      return a.lastBookedAt === null ? -1 : 1;
    }

    const recency = Temporal.Instant.compare(a.lastBookedAt, b.lastBookedAt);
    if (recency !== 0) return recency;

    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}

/**
 * Picks the assignee for `slot` among `candidates` (already filtered to
 * members free for that slot) by weighted least-recently-booked. Returns
 * null when there are no candidates, so the caller can distinguish "no one
 * free" from a real assignment.
 */
export function assign(
  slot: Interval,
  candidates: readonly AssignmentCandidate[],
  history: readonly BookingRecord[],
): string | null {
  const ranked = rank(candidates, history);
  return ranked[0]?.userId ?? null;
}

/**
 * Same ranking as `assign`, but returns every candidate with its computed
 * load so the confirmation UI can show why a given host was picked.
 */
export function explainAssignment(
  slot: Interval,
  candidates: readonly AssignmentCandidate[],
  history: readonly BookingRecord[],
): readonly RankedCandidate[] {
  return rank(candidates, history);
}

function winnerReason(ranked: readonly RankedCandidate[]): AssignmentReason {
  const [winner, runnerUp] = ranked;
  if (!winner || !runnerUp) return "only_available_candidate";
  if (winner.effectiveLoad < runnerUp.effectiveLoad) return "lowest_effective_load";

  if (winner.lastBookedAt === null && runnerUp.lastBookedAt !== null) {
    return "least_recently_booked";
  }
  if (
    winner.lastBookedAt !== null &&
    runnerUp.lastBookedAt !== null &&
    Temporal.Instant.compare(winner.lastBookedAt, runnerUp.lastBookedAt) < 0
  ) {
    return "least_recently_booked";
  }

  return "stable_user_id_tiebreak";
}

/** Captures the complete round-robin decision in a persistence-safe shape. */
export function buildAssignmentExplanation(
  slot: Interval,
  candidates: readonly AssignmentCandidate[],
  history: readonly BookingRecord[],
): AssignmentExplanation | null {
  const ranked = explainAssignment(slot, candidates, history);
  const winner = ranked[0];
  if (!winner) return null;

  return {
    winnerUserId: winner.userId,
    reason: winnerReason(ranked),
    candidates: ranked.map((candidate) => ({
      userId: candidate.userId,
      bookingCount: candidate.bookingCount,
      effectiveLoad: candidate.effectiveLoad,
      lastBookedAt: candidate.lastBookedAt?.toString() ?? null,
    })),
  };
}

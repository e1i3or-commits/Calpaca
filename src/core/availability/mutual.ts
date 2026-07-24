import { Temporal } from "@js-temporal/polyfill";
import type { Interval } from "./intervals";

export type RankedSlot = { slot: Interval; score: number };

function overlaps(left: Interval, right: Interval): boolean {
  return Temporal.Instant.compare(left.start, right.end) < 0
    && Temporal.Instant.compare(left.end, right.start) > 0;
}

export function rankByMutualAvailability<T extends RankedSlot>(
  slots: readonly T[],
  inviteeBusy: readonly Interval[],
): (T & { mutual: boolean })[] {
  return slots
    .map((candidate) => ({
      ...candidate,
      mutual: !inviteeBusy.some((busy) => overlaps(candidate.slot, busy)),
    }))
    .sort((a, b) => {
      if (a.mutual !== b.mutual) return a.mutual ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return Temporal.Instant.compare(a.slot.start, b.slot.start);
    });
}

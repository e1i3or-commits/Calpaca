# Task 10: Round robin assignment (pure)

## Goal
Fair, transparent, non-starving assignment. The inverse of the incumbent
pattern: availability is team-wide first, assignment happens at confirmation.

## Spec
- `src/core/assignment/round-robin.ts`:
  teamAvailability(members) = union of members' free sets (slot generation
  runs per member; a slot is offered if ANY member can take it).
  assign(slot, candidates, history) picks among members free for that slot by
  weighted least-recently-booked: effective load = bookingCount / (weight/100);
  lowest effective load wins; tie-break by longest time since last booking,
  then stable by userId.
- OOO handling: members flagged unavailable are excluded from availability
  AND from assignment, and their absence never hides other members' slots.
- No starvation cap logic (no hiding availability when counts diverge); the
  weighting handles fairness. Export explainAssignment(slot, candidates,
  history) returning the ranked candidates with computed loads, for the
  user-facing transparency endpoint later.
- Tests: distribution over 100 simulated bookings approximates weights within
  tolerance, OOO exclusion, tie-breaks deterministic, explain output matches
  assign choice.

## Acceptance
```
bun run verify
```

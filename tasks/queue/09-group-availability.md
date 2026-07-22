# Task 09: Group availability (pure)

## Goal
"Meet with these people": combined availability with quorum fallback.

## Spec
- `src/core/availability/group.ts`: groupAvailability(hosts, config, now)
  where hosts is [{ userId, open: Interval[], busy: Interval[], role:
  "required" | "optional", prefs }].
- Required hosts: intersection of their free sets (intersectMany from task
  05) feeds slot generation. Optional hosts do not gate eligibility; their
  conflicts and prefs feed scoring (a slot free for optionals outscores one
  that is not).
- Quorum fallback: when the full required intersection yields zero slots in
  the window, compute best slots for each leave-one-out subset of required
  hosts and return { full: [], fallback: [{ missingUserId, slots }] } ranked
  by slot quality. Fallback only drops ONE required host.
- Scoring for group slots averages per-host scores (task 08) across all
  hosts present in the slot.
- Tests: 2 and 5 host intersections, optional-host scoring effect, quorum
  fallback triggers only on empty full intersection, fallback identifies the
  correct missing host.

## Acceptance
```
bun run verify
```

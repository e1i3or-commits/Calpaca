# Task 05: Interval math (pure)

## Goal
The set operations everything else stands on.

## Spec
- `src/core/availability/intervals.ts`, pure functions over
  { start: Temporal.Instant; end: Temporal.Instant }:
  normalize (sort + coalesce overlapping/adjacent), subtract(open, busy),
  intersectMany(sets: Interval[][]) for group booking, clamp(intervals, window).
- Exhaustive tests in tests/core/availability/intervals.test.ts: empty inputs,
  full overlap, partial overlaps both directions, adjacency (touching
  endpoints coalesce in normalize, do not create zero-length in subtract),
  intersectMany with 1, 2, and 5 sets including one empty set (result empty).

## Acceptance
```
bun run verify
```

## Constraints
No imports outside src/lib and Temporal. Zero I/O.

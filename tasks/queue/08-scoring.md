# Task 08: Scoring engine (pure)

## Goal
Rank candidate slots so curated suggestions and group quality both work.

## Spec
- `src/core/availability/scoring.ts`: scoreSlots(slots, context) -> ranked
  [{ slot, score, reasons }]. Context: existing busy intervals, open
  intervals, per-host prefs (morningWeight, adjacencyBonus, focusBlocks per
  docs/SCHEMA.md users.prefs).
- Signals, each its own pure function, combined by weighted sum with weights
  in one exported constant:
  fragmentationPenalty (splitting a large open block scores lower than
  consuming an edge), adjacencyBonus (touching existing busy), timeOfDay
  (morningWeight applied in the host's zone), focusBlockPenalty (inside a
  focus block scores near-zero unless few alternatives exist: penalty relaxes
  when candidate count < 5).
- Deterministic: equal scores tie-break by earlier start.
- Tests: each signal in isolation, the combined ordering on a crafted day,
  determinism (same input twice, identical output), focus-block relaxation.

## Acceptance
```
bun run verify
```

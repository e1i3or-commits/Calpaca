# Task 06: Working-hours rule expansion (pure)

## Goal
Expand weekly rules in a host's zone into concrete UTC open intervals.

## Spec
- `src/core/availability/rules.ts`: expandRules(rules, timezone, window)
  where rules are { dow, start: "HH:MM", end: "HH:MM" } per docs/SCHEMA.md,
  window is a UTC interval, output is UTC intervals.
- DST-correct: expansion happens in the schedule's zone via
  Temporal.ZonedDateTime, then converts to Instant. On spring-forward days a
  09:00-17:00 rule yields 7 hours of wall-clock coverage mapped correctly; on
  fall-back days, 9. Nonexistent local times (inside the spring-forward gap)
  resolve with disambiguation "compatible".
- Tests using the DST fixtures from tests/helpers/fixtures.ts, all four zones,
  plus a rule crossing midnight (start > end spans to next day) and a window
  that starts mid-rule.

## Acceptance
```
bun run verify
```

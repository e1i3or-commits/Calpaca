# Task 03: Result type and core utilities

## Goal
Typed error handling used across the core.

## Spec
- `src/lib/result.ts`: Result<T, E> discriminated union, ok(), err(),
  isOk/isErr guards, map, andThen, unwrapOr.
- `src/lib/id.ts`: token generation for reschedule/cancel tokens
  (crypto.randomUUID + crypto random suffix, URL-safe).
- Tests for both in tests/lib/.

## Acceptance
```
bun run verify
```

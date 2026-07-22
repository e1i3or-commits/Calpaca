# Task 02: Test harness and DST fixtures

## Goal
Shared test utilities so every later core task can express timezone cases in
one line.

## Spec
- `tests/helpers/time.ts`: builders like utc("2027-03-14T09:00Z"),
  zoned("2027-03-14 09:00", "America/New_York"), interval(start, end),
  all returning Temporal types.
- `tests/helpers/fixtures.ts`: named DST scenarios as exported constants:
  US spring-forward (second Sunday March), US fall-back (first Sunday Nov),
  a southern-hemisphere zone (Australia/Sydney), and a no-DST zone
  (America/Phoenix). Each fixture: zone name + the local transition datetime.
- `tests/helpers/time.test.ts` proving the builders round-trip correctly,
  including one assertion across each DST fixture.

## Acceptance
```
bun run verify
```

## Constraints
Temporal API only. If the runtime needs a Temporal polyfill, use
@js-temporal/polyfill and note why in the commit-ready summary at the end of
your work (the loop writes commits; you do not).

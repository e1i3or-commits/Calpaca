# Task 11: Booking event log and state machine (pure core + db glue)

## Goal
Append-only truth; projections that cannot zombie.

## Spec
- `src/core/booking/state.ts` (pure): applyEvent(state, event) reducer over
  kinds from docs/SCHEMA.md bookingEventKind. Illegal transitions (e.g.
  reschedule after cancelled, cancel twice) return err() with a typed reason.
  projectState(events) folds a full history.
- `src/db/booking-repo.ts`: appendEvent(bookingId, kind, payload) inserts the
  event and updates the bookings projection row in one transaction. Reads of
  current state use the projection; a repair function rebuildProjection(id)
  refolds from events.
- Tests: pure state machine exhaustively (every kind from every state);
  repo tests SKIP unless TEST_DATABASE_URL is set (they will run in a later
  integration task); pure tests carry the coverage here.

## Acceptance
```
bun run verify
```

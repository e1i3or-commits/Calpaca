# Task 12: Transactional hold and confirm

## Goal
The no-double-booking guarantee.

## Spec
- `src/db/holds-repo.ts`: createHold(eventTypeId, hostUserIds, slot, ttl)
  inserts one active hold per host inside one transaction; the partial unique
  index (active per host per slotStart) makes a losing race fail cleanly;
  map that failure to err("slot_taken"). confirmHold(holdId, invitee) locks
  the hold rows FOR UPDATE, re-verifies status and expiry, creates the
  booking + "created" event (task 11 repo) and marks holds confirmed, all in
  one transaction. expireHolds(now) releases expired ones (pg-boss will call
  this later).
- Group bookings: all hosts' holds succeed or the whole createHold rolls back.
- Tests gated on TEST_DATABASE_URL (docker-compose.test.yml with Postgres is
  in scope for this task): two concurrent createHold calls for the same
  host+slot produce exactly one winner; confirm after expiry fails; group
  hold rollback when one host is contended.

## Acceptance
```
docker compose -f docker-compose.test.yml up -d --wait && \
TEST_DATABASE_URL=postgres://test:test@localhost:5433/test bun run verify; \
rc=$?; docker compose -f docker-compose.test.yml down; exit $rc
```

## Constraints
Test Postgres on port 5433 to avoid colliding with anything on the box.

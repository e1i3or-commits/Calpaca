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
- The test database is externally provided via TEST_DATABASE_URL. Tests SKIP
  cleanly when it is unset (same convention as task 11). Tests must be
  idempotent against a database of unknown state: create the schema if absent
  by running migrations programmatically, and truncate affected tables in
  beforeEach.
- Tests: two concurrent createHold calls for the same host+slot produce
  exactly one winner; confirm after expiry fails; group hold rollback when
  one host is contended.

## Acceptance
```
bun run verify
```

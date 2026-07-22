# Task 14: Hold, booking, reschedule, cancel endpoints

## Goal
Complete the booking lifecycle over HTTP.

## Spec
- POST /holds: validate slot is currently available (recompute, do not trust
  the client), createHold, return holdId + expiresAt.
- POST /bookings: confirmHold + invitee details; response includes
  rescheduleToken and cancelToken (src/lib/id.ts) and both-timezone times.
  Basic email typo check (common domain misspellings list) returns a
  suggestion field, non-blocking.
- POST /bookings/:id/reschedule and /cancel authenticated ONLY by the signed
  token in the body; reschedule creates a new hold+confirm and appends
  "rescheduled"; cancel appends "cancelled". Illegal transitions surface the
  typed errors from task 11 as 409s.
- Round robin: assignment (task 10) runs inside the confirm transaction.
- Tests: route-level with stubbed repos as in task 13, plus the token auth
  paths (wrong token 403, right token on cancelled booking 409).

## Acceptance
```
bun run verify
```

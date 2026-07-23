# Task 20: Round-robin assignment transparency — persist and expose

Overnight-safe. The dashboard panel over this endpoint is task 27
(interactive).

## Goal
Every round-robin booking records WHY its host won, captured at assignment
time (loads drift afterwards — recomputing later would lie), readable by an
authenticated admin.

## Spec
- `explainAssignment` already exists
  (`src/core/assignment/round-robin.ts:143`). The confirm flow already
  builds the assignment inputs (`src/api/routes/bookings.ts` around line
  325: `candidates` + `history` passed into `confirmHold`, which picks the
  winner inside the transaction). Capture the explanation for the actual
  winner — ranked candidates, effective weighted loads, winner and reason —
  and persist it under an `assignment` key in the `created` booking event's
  payload, written in the same transaction as the booking. Solo and group
  bookings store nothing.
- If a reassignment flow appends `reassigned` events, give them the same
  payload treatment; if none exists yet, do not build one.
- `GET /api/me/bookings/:id/assignment` (behind the same `requireAuth`
  injection pattern as the other `/api/me` routes): returns the stored
  explanation from the booking's latest `created`/`reassigned` event, or
  `404 { error: "no_assignment" }` when the booking has none (solo/group)
  or does not exist.
- Tests in NEW file `tests/api/assignment-explain.test.ts`, following the
  existing fixture conventions in `tests/api/bookings.test.ts`: a
  round-robin confirm persists an explanation whose winner matches the
  booked host and whose candidate ranking is complete; the endpoint returns
  it; a solo booking yields `no_assignment`; unauthenticated access is
  rejected.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. The explanation must be computed from the
same inputs the assignment used — no re-derivation outside the confirm
transaction. Core stays pure: `explainAssignment` gets data as parameters.

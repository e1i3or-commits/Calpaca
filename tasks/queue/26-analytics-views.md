# Task 26: Analytics SQL views

Overnight-safe. Corrects a roadmap assumption: ARCHITECTURE.md ships
analytics as "documented SQL views" but none exist yet. The read-only admin
page over them is Phase 3C (backlog).

## Goal
The event log pays its analytics dividend: four documented views any
Postgres client (or Metabase) can query, created by migration.

## Spec
- One hand-written custom migration (drizzle-kit supports custom SQL
  migrations; follow its journal conventions) creating:
  - `analytics_booking_outcomes`: bookings per event type per calendar
    month (UTC) broken down by final status (confirmed / cancelled /
    no_show), derived from `booking_events`, not the projection.
  - `analytics_no_show_rate`: per event type, no-show count over completed
    meetings (startsAt in the past, not cancelled), with the rate as a
    numeric column.
  - `analytics_lead_time`: per booking, the interval between the `created`
    event's createdAt and the booked startsAt; include event type slug so
    consumers can aggregate (median/p90 is the consumer's job, keep the
    view row-level).
  - `analytics_rr_distribution`: for round-robin event types, bookings per
    host (unnest `host_user_ids`) joined to the host's configured weight —
    the fairness check: share of bookings vs share of weight.
- The booking funnel view (page views → slot views → drop-off) is OUT of
  this task: no view/impression events are captured anywhere yet, so there
  is nothing to query. Do not invent client-side tracking. Note the gap in
  the doc.
- `docs/ANALYTICS.md`: each view's columns, its definition rationale
  (event log as source of truth), one example psql query per view, and the
  funnel gap note.
- Tests in NEW file `tests/db/analytics-views.test.ts` (DB-backed,
  TEST_DATABASE_URL skip-and-truncate convention, run migrations
  programmatically like tasks 11/12): seed a small scenario — a confirmed,
  a cancelled, and a no-show booking across two event types, one
  round-robin pair with uneven weights — and assert each view returns the
  expected rows.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. Views only — no materialized views, no
new tables, no triggers. Everything derives from `bookings`,
`booking_events`, `event_types`, and `event_type_hosts`.

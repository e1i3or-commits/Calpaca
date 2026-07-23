# Task 23: Admin bookings endpoints + no-show action

Overnight-safe. Depends on task 21 (webhook kinds include booking.no_show).
The dashboard UI over these endpoints is task 27 (interactive).

## Goal
Bookings become visible and actionable to an authenticated host: list,
detail with full event history and invite delivery status, and a no-show
action. (Delivery-status INGESTION already exists —
`/api/webhooks/email-delivery` normalizes provider events via n8n into
`invite_delivered`/`invite_failed` and the `inviteStatus` projection; this
task only has to read it back out.)

## Spec
- `GET /api/me/bookings` (same `requireAuth` injection pattern as the other
  `/api/me` routes): paginated list, query params `filter=upcoming|past`
  (by `startsAt` vs now, default upcoming), optional `status`, `page`/
  `pageSize` (default 20, max 100). Each row: id, eventType `{ slug,
  title }`, start/end, inviteeName, inviteeEmail, hostUserIds, status,
  inviteStatus. Times follow the time-handling rule: UTC plus a rendering in
  the requester-declared `?timezone=` (default UTC), same RenderedInstant
  shape the public API uses.
- `GET /api/me/bookings/:id`: everything above plus inviteeTimezone,
  inviteeNotes, routingAnswers, googleEventId presence (boolean, not the
  id), and the full ordered `events` timeline
  `[{ kind, payload, createdAt }]` from `booking_events`.
- `POST /api/me/bookings/:id/no-show`: appends a `no_show` event through the
  existing state machine (`src/core/booking/state.ts` already handles the
  kind and its illegal transitions). Illegal transition → `409 { error:
  <BookingStateError reason> }`; unknown booking → 404. Projection update
  comes free from the existing appendEvent path. Enqueue webhook fan-out
  for `booking.no_show` via the task-21 helper.
- Tests in NEW file `tests/api/admin-bookings.test.ts`, existing fixture
  conventions: list filters and paginates; detail carries the event
  timeline and inviteStatus; no-show on a confirmed booking appends the
  event and flips status; no-show on a cancelled booking is 409; all three
  routes reject unauthenticated requests.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. No invitee PII beyond what the booking
row already holds; host emails via the existing directory join only. The
booking projection is never written directly — every mutation goes through
the event log.

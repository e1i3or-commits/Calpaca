# Task 21: Webhooks on every event kind + delivery log

Overnight-safe.

## Goal
The webhook pipeline (payload builder, HMAC signing, pg-boss fan-out +
delivery with retries, admin CRUD — all already built) fires for EVERY
booking event kind, and every delivery attempt is auditable in a log table.

## Spec
- Extend `WebhookEventKind` / `WEBHOOK_EVENT_KINDS`
  (`src/core/webhook/payload.ts`) additively with `booking.reassigned`,
  `booking.no_show`, `booking.invite_sent`, `booking.invite_delivered`,
  `booking.invite_failed`, `booking.reminder_sent` — one webhook event per
  `booking_event_kind` enum value, mechanical name mapping.
- Emission today covers only created/rescheduled/cancelled. Route the rest
  through the same fan-out: every `appendEvent` site (invite-email job after
  send, email-delivery ingestion route, reminder job, and the no-show action
  when task 23 lands) enqueues webhook fan-out with the matching kind.
  Prefer one shared helper over per-site copies. Subscription filtering via
  the existing `matchesSubscription` — endpoints only receive kinds they
  subscribed to, so added kinds are opt-in and change nothing for existing
  rows.
- New table `webhook_deliveries` (drizzle schema + generated migration):
  `id` (the deliveryId), `webhookId` fk, `event`, `status`
  (`pending | delivered | failed`), `attempts` int, `lastHttpStatus` int
  nullable, `lastError` text nullable, `createdAt`, `completedAt` nullable.
  Fan-out inserts `pending` rows; `deliverWebhook` increments `attempts` and
  records the outcome per try — `delivered` on 2xx, error details retained
  on failure, `failed` only once pg-boss retries are exhausted (job
  `retryCount` vs `retryLimit`).
- `GET /api/me/webhooks/:id/deliveries?limit=` (default 50, newest first) on
  the existing webhook-admin router, same auth injection.
- Tests in NEW files (`tests/api/webhook-delivery-log.test.ts`, plus a new
  core test file if the payload builder grows logic): fan-out for an
  `invite_delivered` append reaches only subscribers of that kind; a
  successful delivery marks the row `delivered` with attempts=1; a non-2xx
  records the status and keeps the row `pending`; the admin listing returns
  rows for the right endpoint only.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files (existing webhook tests pin current
behavior for the original three kinds — additive changes must keep them
green). Migration via `bunx drizzle-kit generate`; never hand-edit applied
migrations.

# Protected kickoff delivery

Built for franchise onboarding kickoffs; not deployed or enabled for public
booking. Migration `0056_kickoff_delivery_outbox.sql` adds durable operations,
audit events, deduplicated recipient receipts and a dispatcher heartbeat.
This does not implement recurring follow-up scheduling.

## Booking and delivery

Creating, moving or cancelling a protected booking writes its delivery intent
in the same PostgreSQL transaction as the booking event and projection. Failure
to save the intent rolls back the booking change. Each operation has a unique
source event/kind, frozen invitation context, stable message/event IDs, an
account-lead owner and a 15-minute deadline. Snapshots include private recipient
data and booking management tokens; they must not appear in logs or reports.

A minute-based worker recovers pending operations independently of the generic
email enqueue. It also discovers due 24-hour reminders and persists their
intent. Row claims, two-minute leases and ordered operations serialize dispatch
per booking. New changes supersede untouched queued operations. A move before
first dispatch creates the event at the latest time; a missing previously
dispatched event requires review. Later operations wait behind uncertain
earlier effects. All SQL projection writes use the booking lock order.

Google writes use an explicit event ID, private booking/operation references,
readback and conditional updates. Verification includes the organizer, meeting
times, complete required roster and requested Meet conference. A lost response
is reconciled by reading the existing event. An incomplete same-operation
readback does not resend native invitations. Cancellation verifies deletion;
reminders verify the existing calendar event without modifying it. Calendar
destination binding remains fixed across later operations. These choices use
Google's [event insertion contract](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
and [conditional resource updates](https://developers.google.com/workspace/calendar/api/guides/version-resources).

Only after calendar readback does the worker persist `mailStartedAt` and call
the configured SMTP transport. The transport must account for every recipient
as accepted or rejected. Acceptance records `invite_sent`; it is not delivery.
All six internal participants, the franchisee and any additional guests need
recipient-specific confirmation before the operation becomes `delivered`.
This means delivery to recipient mail systems, not that people read or accepted
the meeting. Google-generated native invitation emails do not have delivery
receipts in this integration; calendar readback and Calpaca email feedback are
separate evidence.

Partial rejection and negative delivery feedback remain failures. A late
bounce/complaint cannot be erased by a delayed positive receipt. Receipts for
an old booking version cannot deliver a newer version. Reminders and
cancellations retain their own operation status.

## Configuration and receipt contract

Require `SMTP_URL`, `EMAIL_FROM`, an HTTPS `PUBLIC_URL`, Google authorization
for the selected organizing user/calendar, and
`KICKOFF_DELIVERY_WEBHOOK_SECRET`. Store secrets in the deployment secret store.
The webhook secret's presence is only a configuration check; it is not proof
that the provider feedback adapter is working.

`POST /api/webhooks/kickoff-delivery` uses
`Authorization: Bearer <KICKOFF_DELIVERY_WEBHOOK_SECRET>`, independently of
Calpaca session/API-token authentication. Its strict JSON contract is:

```json
{
  "deliveryId": "00000000-0000-4000-8000-000000000001",
  "messageId": "<original-correlation-message-id>",
  "providerEventId": "provider-and-message-scoped-recipient-event-id",
  "recipient": "person@example.invalid",
  "status": "delivered"
}
```

Statuses are `delivered`, `bounced` or `complained`. An identical provider event
ID/payload is a successful duplicate; reusing it for different evidence is a
409 conflict. Unknown operations return 404. Wrong message/recipient or a
receipt before email dispatch returns 409. Invalid input returns 400; missing
or wrong authentication returns 401 (404 if feedback is not configured).

A provider adapter must authenticate the original feedback, retain the original
operation/message correlation despite provider message-ID rewriting, split
multi-recipient events into stable recipient-specific IDs, normalize statuses,
and reliably retry this endpoint. This adapter, including SES feedback
normalization, is still to build and test. Do not point raw SES/SNS payloads at
this endpoint or use a booking-wide legacy delivery callback.

## Health and recovery

`GET /api/automation/kickoff-deliveries` requires an authenticated workspace
owner/admin. Its no-store report includes all-workspace attention/overdue
counts, dispatcher heartbeat, and the latest 200 safe operation summaries.
It exposes no recipient emails, credentials, snapshots or management tokens.
A missing heartbeat or one older than three minutes sets `workerStale`.
Overdue counts are calculated from persisted deadlines at read time, so a dead
worker cannot hide overdue work by failing to update status. HTTP 200 alone is
not a healthy result: the monitor must inspect the flags/counts.

Safe calendar failures retry with bounded backoff, at most five attempts before
attention is required. Expired pre-mail leases are recoverable. Any uncertain
SMTP outcome is held as `email_outcome_unknown`, with no automatic resend.
There is no claim of exactly-once SMTP. Recipient feedback can reconcile a
lost SMTP response. If evidence is missing, staff must investigate with the
provider; a reviewed resolution/resend UI is still to build.

`POST /api/automation/kickoff-deliveries/:id/retry` is workspace-admin scoped.
It permits retry only from `needs_attention` before email started, records the
requesting user and renews the deadline. Missing records return 404; unknown
or already-started mail returns 409 `retry_requires_reconciliation`.

The independent monitoring VM must poll this report, alert on request/auth
failure, stale worker, overdue work or attention-required operations, route to
the assigned owner, and track recovery. This monitor and alert route are not
installed by this change. Staff delivery controls in the Engagement UI are
also still pending. Persisted failure records alone do not satisfy the complete
production alerting requirement.

## Activation boundary

Kickoff publication remains unavailable and Tyger's welcome gate stays closed.
Before enabling bookings: bind the real lead/organizer and six accounts, verify
Google and email delivery end to end, implement/authenticate provider feedback,
activate independent alerts, and implement controlled publication and the
n8n/Tyger receipt adapter. Tests use local PostgreSQL and synthetic provider
responses, with no real email or calendar effects.

Verification: all 802 tests passed against local PostgreSQL, with TypeScript,
lint, OpenAPI parity and repository invariants passing. The production web
build passed with its existing large-chunk advisory. No web UI was changed in
this delivery milestone.

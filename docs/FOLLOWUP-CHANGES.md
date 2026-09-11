# Reviewed changes to issued onboarding calls

The existing follow-up preview/apply API now reconciles booked dates in the
same transaction as its reviewed schedule revision and audit. A move retains
the booking ID and Google event ID and queues one durable reschedule. Pausing,
ending or removing a future date queues cancellation. Past calls stay unchanged.
New and resumed draft dates still require the reservation/activation adapter.

Required host locks precede the Engagement, booking and delivery records.
Managed booking events require the persisted request audit, current revision,
matching occurrence and exact reviewed action/times. Generic/public mutation
routes cannot supply this authorization. A conflict rolls back schedule, booking,
approval revision, audit and outbox together. Repeating an applied request returns
its current saved state without a second operation.

A batch can use slots vacated by other bookings in that same reviewed change.
Only their audited old reservations are ignored. A durable provider update can
supersede an older cached Google time until the next calendar sync; fresh provider
conflicts become authoritative again. External meetings and active holds remain
blocking. Protected follow-up conversations reserve at most 60 days ahead, inside the
90-day calendar cache and its required weekly full refresh. Later planned dates
wait for the rolling reservation worker; a larger event-type window cannot
bypass the coverage guard.

The transaction refuses changes while a related delivery is processing or has
an attempted, unresolved provider outcome. It returns a visible 409 with the
reason and preserves the existing plan. Delivery problems retain their original
assigned owner/health entries. Known SMTP acceptance permits a later operation;
recipient delivery evidence remains independently tracked for each version.
Cancellation dispatch does not require an active Engagement or an available
kickoff: closing the Engagement cannot strand queued cancellations.

Resume never revives a cancelled calendar event. After verified calendar removal
and recipient-level cancellation delivery, reservation creates a new booking for
the same occurrence. Migration 0059 retains every booking generation and backfills
existing reservation history. The reservation API exposes that scoped history.
Unverified cancellation blocks a replacement with an assigned issue.

The Engagement UI distinguishes existing invitations and draft dates in previews,
allows reviewed changes after issuance, and shows current cancellation/invitation
delivery states. A generic Engagement pause/completion/archive remains blocked
while confirmed future follow-up bookings exist; pause/end the schedule first.
Once those bookings are cancelled, status transition is allowed and cancellation
operations continue to dispatch.

Verification (2026-09-11): 831 tests / 2,823 assertions and the full repository
gate pass against local PostgreSQL, including type checks, lint and OpenAPI parity.
The web build passes. Local Chrome checks cover weekly cadence, moving an issued
call, pause/resume, cancellation status, reload and dark-mode layout. Synthetic
provider adapters verify delivery and replacement; no real email, calendar or
Slack messages were sent. Temporary browser-review tooling is excluded.

Still to build: controlled initial agreement/activation, automatic reservation
and rolling extension, real provider-feedback wiring, independent monitoring
activation and the n8n/Tyger adapter. This branch has not been deployed.

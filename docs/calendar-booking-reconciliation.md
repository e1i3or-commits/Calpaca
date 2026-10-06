# Organizer calendar time changes

Google sync imports start/end changes for protected onboarding bookings from
only the verified organizer calendar and bound event identity. An audit event
preserves the booking ID and invitation receipt, updates the follow-up occurrence
as an exception, and invalidates stale schedule previews. It does not send an
invitation or write back to Google. Cadence and attendees are unchanged.

A provider version watermark includes unchanged observations, preventing stale
sync results from undoing a newer observation. Workspace/host/booking locks
serialize this with normal schedule edits and delivery claims. Pending Calpaca
operations retain ownership of their next calendar version; in-flight reminders
block importing a changed time until their outcome is settled. Unsent reminders
for the old time are superseded. New reminders use the current booking event as
their idempotency key and retain the existing 24-hour eligibility rules.

Existing uncompleted, unleased meeting-notes jobs are made eligible to recheck
on a time change; the worker still applies the meeting-end gate. Completed
reviews are not regenerated. Cancellations, recurrence replacement and attendee
changes are outside this importer. Reconciliation failures prevent cursor
advancement and flag the calendar unhealthy through the sync worker.

Migration 0066 adds booking_calendar_observations. Rollback can keep this additive
table; already imported times remain valid. Recover a blocked identity/version
only after checking the organizer event and delivery history; do not manufacture
email receipts. An existing organizer connection can be queued with
`enqueueSync(connectionId, {forceFull:true})` to replay its current sync window.

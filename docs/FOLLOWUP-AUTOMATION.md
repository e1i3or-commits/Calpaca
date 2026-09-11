# Automatic follow-up reservation

Calpaca's pg-boss worker `followup-reservation-sweep` runs each minute. It discovers
up to 20 eligible saved occurrences and invokes the protected, idempotent
reservation transaction. Only enabled, approved schedules in active Engagements
are processed. Dates beyond the protected 60-day calendar coverage window remain
planned and enter eligibility as the window advances.

The administrator that prepared the private conversation is the automation actor.
Every sweep checks that person's current active account and workspace admin/owner
role. Missing/revoked authority creates an assigned issue, rather than fabricating
an administrator role. The eventual n8n adapter should prepare conversations using
the dedicated automation identity. Initial activation still has no public API.

Blocked reservations have a five-minute retry cooldown. Successful concurrent
requests reuse the same booking. A past date that was never reserved becomes
`followup_reservation_missed`; it does not vanish from monitoring. Paused/ended
schedules and cancelled occurrence rows are not issued. A resumed cancelled
booking still waits for verified cancellation before its replacement.

The existing authenticated delivery health endpoint adds `reservationPending`,
`reservationOverdue`, `schedulerStale` and `schedulerLastSweepAt`. Aggregation is
uncapped. The setup deadline starts at the latest of activation, occurrence update,
and entry into the coverage window, with 15 minutes allowed for reservation.
A separate `followup-scheduler` heartbeat is written only after a successful
sweep. Database errors fail the job and leave that heartbeat stale. Invitation
dispatch has its own independent heartbeat and delivery deadlines.

## Rolling extension

The same worker maintains the configured number of future dates for enabled,
planned schedules. The `extend` preview/apply command uses the existing revision,
preview hash, permission and atomic audit path. It advances a persisted recurrence
index independently of occurrence position, so shortening a plan never revives
retired IDs or skips the next intended date. Monthly date/weekday anchoring and
local wall time remain tied to the last configured rule. Individual exceptions
remain intact; overlap or ambiguous future DST times block extension visibly.

Up to 20 schedules are checked per sweep, with 15-minute failure backoff. A manual
schedule edit clears that backoff so the next sweep can verify the correction.
Assigned extension issues and recovery events persist in migration 0060, and the
Engagement displays the owner and recovery instruction. `extensionAttention` and
`extensionOverdue` are uncapped health counters. Aggregate `attention`, `overdue`
and `workerStale` now also include scheduler/extension failures, preserving the
existing monitor contract. A dead scheduler cannot conceal an exhausted horizon.

The chosen future-date count bounds the planned horizon; actual invitations stay
inside the independent 60-day reservation window. New dates enter the same
reservation, availability and recipient-delivery pipeline as initial dates.
Paused/ended schedules are never automatically extended.

Verification: all 841 tests / 2,874 assertions, the full repository gate and the
web build pass against local PostgreSQL. Tests cover concurrent extension,
month ends, long elapsed periods, retired positions, DST ambiguity, preserved
exceptions, overlapping dates, assigned errors and recovery. Local Chrome
verified the visible issue owner and recovery instruction. No live provider
calls or deployment were performed.

These are local application and monitoring contracts, not deployed monitoring.
Initial franchisee agreement/activation, real delivery feedback, independent
alert binding and the n8n/Tyger adapter remain next.

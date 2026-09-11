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

These are local application and monitoring contracts, not deployed monitoring.
Rolling extension, initial franchisee agreement/activation, real delivery
feedback, independent alert binding and the n8n/Tyger adapter remain next.

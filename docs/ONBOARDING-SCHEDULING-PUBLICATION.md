# Onboarding scheduling publication and cadence start

A prepared onboarding Engagement can publish its protected kickoff and start a
reviewed follow-up cadence through authenticated application APIs. Migration
`0062_onboarding_scheduling_actions` saves actor, revision, operation and replay
hash atomically with the state change. No provider calls occur in publication.

The deployment switch `ONBOARDING_SCHEDULING_ENABLED` defaults off. Enable it only
after deploying the matching Calpaca APIs/jobs, binding the real six-person team,
verifying calendar writes/readback, SES feedback and actual independent failure/
recovery alerts. The switch controls new publication/activation; it does not
revoke previously published bookings or cancel issued meetings. Pause/end the
Engagement schedule through its existing reviewed controls when that is intended.

`GET /api/me/engagements/:id/onboarding-scheduling` returns current revision,
readiness issues, actual kickoff publication/link state and the saved follow-up
review hash, timezone, dates and eligible confirmed kickoffs. It authorizes
Engagement access; only staff permitted to manage it can change the cadence.

`POST .../onboarding-scheduling/publish-kickoff` requires an active workspace
administrator and `{revision, requestId}`. It checks prepared protected config,
all six calendars, deployment/provider settings and fresh dispatcher, scheduler
and SES-poller heartbeats. It atomically marks the Engagement active, the kickoff
conversation ready and the binding published. Source recovery, repeated prepare
calls and the Engagement now expose the real URL/state, including unavailable
state when publication is paused or calendar setup fails.

`POST .../onboarding-scheduling/enable-followups` allows the account lead or an
administrator and requires `{revision, requestId, kickoffBookingId, previewHash}`.
It checks the saved planned dates, current review, a confirmed kickoff whose latest
invitation is delivered with verified calendar state, the four required calendars,
all six active members and the preparing automation administrator's current active
membership. Dates must be future 45-minute calls after the kickoff ends. The
transaction approves the revision and enables the private follow-up conversation.
The existing worker reserves dates and queues delivery; activation itself does
not report email delivery or write provider calendars.

The review hash covers the exact saved rule, occurrence dates/statuses and eligible
kickoff versions. A changed plan requires a fresh review. Concurrent identical
requests apply once; changed reuse of a request ID conflicts. Replays report the
current state and do not reactivate an Engagement that was subsequently paused.
Calendar setup and the actual slot are rechecked by the booking/reservation paths.

The Engagement includes setup, readiness refresh, kickoff publication/link and
cadence-start controls. Staff see the confirmed kickoff, exact dates and timezone
before starting follow-ups. Kai/Andrew remain optional on follow-ups. Status copy
separates enabled cadence, saved reservations and queued/delivered invitations.
The worker also now rejects inactive workspace memberships even when the stored
role still says administrator.

Verification: **854 tests / 3,003 assertions**, full type/lint/OpenAPI gate and web
build. PostgreSQL tests cover scope/authority, deployment and heartbeat blocks,
concurrent replay, audit rollback, real source recovery, stale review, undelivered
kickoff, date ordering and private four-required/two-optional reservations.
Chrome verified local publication, preparation, cadence review/start, reload and
three queued reservations with synthetic records. Light/dark presentation was
inspected. Temporary review files/server/tab were removed. No real calendar,
email or live publication was performed; provider and monitor activation remains
unverified. The n8n/Tyger handoff is the next dependency.

The onboarding source projection also returns `workspaceId` for the authenticated
Calpaca workspace. Tyger's n8n handoff requires it before attaching the
Engagement to a launch, preventing a misbound API credential from supplying
an otherwise similar source receipt. Verified with the full 854-test gate.

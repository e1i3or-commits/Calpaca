# Franchise onboarding Engagements

The automation API creates a restricted draft Engagement for a source launch
and saves a planned meeting cadence. Separate guarded actions publish the
kickoff and enable follow-ups once their prerequisites pass. The Engagement
overview distinguishes preparation, publication, reservations and delivery.

## Routes

- `POST /api/automation/franchise-onboarding`: workspace owner/admin only.
  HTTP 201 creates the draft; HTTP 200 reuses an identical source request.
- `GET /api/automation/franchise-onboarding/:sourceWorkspaceId/:projectKey`:
  owner/admin recovery after an interrupted request.
- `PATCH /api/me/engagements/:id/onboarding-cadence`: owner/admin/account lead;
  body `{ "revision": 1, "cadence": "weekly" }`. Other choices are `biweekly`
  (the default) and `monthly`. Closed Engagements reject changes.

Sessions and existing personal API tokens use the ordinary authentication path.
The authenticated workspace controls every query; the source workspace ID is
only an external correlation value. See the generated OpenAPI document for
input fields and constraints.

Provisioning requires four distinct Franchise Success user IDs and separate
Kai/Andrew IDs. All six must be active workspace members. Kickoff requires all
six. Follow-ups require the four Franchise Success members and include the two
leaders as optional. Both durations default to 45 minutes. The account lead
must be in Franchise Success; the organizer must be a kickoff participant.

## Transaction and identity

Migration 0054 stores one mapping per Calpaca workspace/source workspace/project
key, plus an audit row per creation or cadence change. The client, Engagement,
people, source plan and audit entry commit together. Failed persistence rolls
back all new records. Workspace locking serializes simultaneous source replays.

A CRM Franchisee reuses the client mapped to that CRM ID, not a name match.
An unmapped same-name client returns `client_identity_review_required`.
`existingClientId` allows an explicitly resolved association; it cannot link a
foreign workspace client or a client mapped to a different CRM Franchisee.
The caller must supply verified CRM references; Calpaca does not call CRM.

Conflicting replays return `source_conflict` and never rewrite the plan. Cadence
changes use a separate revision check and audit entry. A replay does not reset
the latest cadence. `revision_conflict` requires reloading the current plan.
The attendance plan remains the original snapshot; no automatic team membership
or calendar reconciliation is implied by reading it.

## Scheduling boundary

Source recovery returns the actual protected kickoff URL only after publication
and current calendar/configuration checks. Draft creation alone cannot release
the welcome email. Publication and cadence start require explicit deployment
configuration and verified worker readiness; see
[publication and cadence start](ONBOARDING-SCHEDULING-PUBLICATION.md).

Kickoff confirmation permits one confirmed kickoff per protected conversation.
Concurrent requests at different times cannot create duplicate kickoffs. Holding
a new time and rescheduling the existing booking remain supported. Follow-ups
stay bound to the kickoff used to enable them; a different kickoff ID conflicts.

Cadence changes use [reviewed schedules](FOLLOWUP-SCHEDULE.md), with weekly,
biweekly and monthly choices, timezone-aware dates, individual exceptions and
pause/resume/end controls. [Reservation](FOLLOWUP-RESERVATIONS.md),
[calendar/email delivery](KICKOFF-DELIVERY.md),
[rolling scheduling](FOLLOWUP-AUTOMATION.md) and
[SES feedback](SES-ONBOARDING-FEEDBACK.md) have separate durable state and
assigned failures. An unbooked follow-up's failure and owner appear beside its
saved date. Provider deployment, live canaries and monitoring activation remain
required; local verification does not establish production readiness.

## Verification

`TEST_DATABASE_URL=<disposable-local-postgres> bun run verify` exercises real
PostgreSQL tests, including concurrent create/edit and forced transaction
rollback. `bun run build:web` builds the staff view. Local browser review covered
all three cadence choices, persistence across reload and light/dark rendering.
The onboarding tests create no provider records and send no messages.

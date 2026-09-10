# Franchise onboarding Engagements

The automation API creates a restricted draft Engagement for a source launch
and saves a planned meeting cadence. It does not publish booking links or
create calendar invitations yet. The Engagement overview shows that state.

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

Every automation output returns `kickoffBookingUrl: null`,
`schedulingState: "not_published"` and the remaining publication/scheduler issues.
An upstream welcome sender must not interpret draft creation as booking ready.
The main Engagement's active status does not change this scheduling state.

Next build publication with exact required-host enforcement at availability,
reservation and confirmation, calendar freshness checks and a verified public
URL. Carry optional roles into calendar and ICS invitations. Recurrence needs
an agreed organizing calendar, timezone/local-time anchor, calendar-month rules,
bounded future occurrences and revision-aware update/pause/completion handling.
The planned-cadence selector does not reschedule existing meetings.

## Verification

`TEST_DATABASE_URL=<disposable-local-postgres> bun run verify` exercises real
PostgreSQL tests, including concurrent create/edit and forced transaction
rollback. `bun run build:web` builds the staff view. Local browser review covered
all three cadence choices, persistence across reload and light/dark rendering.
The onboarding tests create no provider records and send no messages.

# API reference

Calpaca publishes its OpenAPI 3.1 document at `/openapi.json` and serves a
searchable, dependency-free reference at `/api-docs`. On Calpaca Cloud:

- [Searchable API reference](https://app.calpaca.io/api-docs)
- [OpenAPI JSON](https://app.calpaca.io/openapi.json)

The checked-in [`openapi.json`](openapi.json) is suitable for client
generation and offline tooling. Organizer endpoints accept the browser session
created by Google sign-in. Personal API tokens can also authenticate organizer
requests:

```http
Authorization: Bearer calpaca_your_token
```

Generate tokens under **Profile & API** in the organizer dashboard. The full
secret is shown once, stored only as a SHA-256 hash, and can be revoked at any
time. Public booking endpoints do not require a session. Provider webhook
authentication is described per operation.

## Organizer booking changes

Invitees cancel and reschedule with the tokens in their email links
(`/bookings/{id}/cancel` and `/bookings/{id}/reschedule`). Organizers use the
authenticated equivalents, which accept a session or a personal API token:

- `POST /api/me/bookings/{id}/cancel` with an optional `{ "reason": "..." }`.
- `POST /api/me/bookings/{id}/reschedule` with `{ "start": "<ISO instant>" }`.
  `end` may be given but must keep the booking's current duration; it defaults
  to that duration. Times in the response use `?timezone=` (default UTC).

A host of the booking or a workspace admin may act. Someone who can see the
booking without being either receives `403 not_booking_host`; anyone else gets
`404 booking_not_found`. The new time is checked against the hosts'
availability exactly as on the invitee path (`409 slot_not_available`), and a
state-machine refusal returns `409 illegal_transition` with its `reason`. The
invitee is emailed and the calendar invitation updated as on the invitee path.
The `cancelled` or `rescheduled` booking event, and its webhook, record
`actor: { "kind": "organizer", "userId": "..." }`.

## Engagements as meeting series

Dashboards outside Calpaca (Tyger) read Engagements as meeting series with a
session or a personal API token. Visibility is the Engagement's own: workspace
admins, the account lead, assigned people, or everyone for workspace-visible
Engagements.

- `GET /api/me/engagement-series` (optional `?status=`) lists each Engagement
  with `onboarding` (source project key, location key and name, franchisee id,
  stage `kickoff | followups | checkin | complete`), `cadence`, `schedule`
  (status, rule and the `revision` the follow-up schedule commands take),
  `progress` (`held`, `total`, `noShows`, `next`, `lastHeld`), `people`
  (Engagement role and follow-up `attendance`), the `eventTypes` it owns
  (`kind` kickoff, followup, checkin, one_off or conversation, and whether it
  is `published`) and `canManage`. With `meetingsFrom` and `meetingsTo` (ISO
  instants, at most 93 days apart) each Engagement also carries its booked
  meetings that start in that window, with their `hostUserIds`, so a calendar
  outside Calpaca can show them beside other bookings. Planned dates are left
  out.
- `GET /api/me/engagement-series/{id}` adds `meetings`: every kickoff,
  check-in, one-off and conversation booking and every follow-up date, with
  `state` planned, paused, booked, held, no_show, cancelled or unbooked (a
  date that passed without a booking). Follow-ups carry the `occurrenceId`
  that `move` and `skip` take. Planned dates are never reported as meetings.

Changes to meetings go through the reviewed follow-up schedule
(`POST /api/me/engagements/{id}/followup-schedule/preview`, then `/apply` with
the returned `previewHash` and a request UUID), so calendar updates and
franchisee email are identical to the Engagement page. Commands are
`configure`, `move`, `skip`, `pause`, `resume`, `end` and `extend`; see
[FOLLOWUP-SCHEDULE.md](FOLLOWUP-SCHEDULE.md). Account leads and workspace
admins may apply them.

The Engagement team (who can see a restricted Engagement and who it lists)
changes with `PUT /api/me/engagements/{id}/people/{userId}` and
`{ "role": "..." }`, and `DELETE` on the same path. The person must be an
active workspace member (`400 invalid_engagement_person`). The account lead
(`409 account_lead`) and anyone on an onboarding meeting roster
(`409 meeting_attendee`) cannot be removed; the roster itself is fixed by
the onboarding plan.

## Updating the document

When an endpoint is added or removed, update the operation registry in
`src/api/openapi.ts`, then regenerate the checked-in document:

```sh
bun run openapi:generate
```

The test suite compares the registry with Hono's declared routes and compares
the generated output with `docs/openapi.json`. Either kind of drift fails the
normal verification gate.

Better Auth owns the implementation-specific `/api/auth/*` endpoints. They
are intentionally excluded from this application API document.

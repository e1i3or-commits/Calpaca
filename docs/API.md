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

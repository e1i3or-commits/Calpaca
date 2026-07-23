# Task 25: "Suggest a different time" — backend

Overnight-safe. Depends on task 22 (rate-limit middleware). The invitee-
facing form is task 28 (interactive).

## Goal
An invitee who finds no workable slot can propose alternatives instead of
bouncing. Proposals reach the host as an email and a webhook event. This is
explicitly NOT mutual mode: no invitee account, no invitee calendar OAuth,
no automatic booking.

## Spec
- New table `time_suggestions` (drizzle schema + generated migration): id,
  eventTypeId fk, inviteeEmail, inviteeName, inviteeTimezone (IANA),
  proposedSlots jsonb (1–3 of `{ start, end }`, UTC ISO strings), message
  text nullable (max 1000), createdAt.
- `POST /event-types/:slug/suggestions` — public, covered by the task-22
  rate-limit middleware with its own bucket (default 5/min/IP,
  env-overridable). Zod: valid email, non-empty name, valid IANA timezone
  (validate by attempting a `Temporal` zone construction, same approach the
  booking flow uses), 1–3 slots, each start strictly in the future and
  before its end, message trimmed with whitespace-only collapsing to
  absent (the invitee-notes convention). 404 for unknown slugs. Response
  `201 { suggestionId }`.
- Host notification email via the existing mailer to every host on the
  event type: who is asking, their message, and each proposed window
  rendered in BOTH the host's timezone and the invitee's (time-handling
  rule). Compose as a pure function in `src/core/invite/` (or a sibling
  core module) with colocated tests; the job/route wires I/O.
- Webhook event `suggestion.created`: extends the webhook kind list with a
  non-booking payload — deliveryId, event, occurredAt, suggestion
  { id, eventType { id, slug, title }, invitee { email, name, timezone },
  proposedSlots (UTC + invitee rendering), message }. Reuses the existing
  signing, fan-out, retry, and (task 21) delivery-log machinery;
  subscription matching means only endpoints subscribed to
  `suggestion.created` receive it.
- Tests in NEW files (`tests/api/suggestions.test.ts`, core email test):
  happy path stores the row and enqueues email + webhook; past slot
  rejected; >3 slots rejected; bad timezone rejected; unknown slug 404;
  rate limit returns 429; email body contains both timezone renderings.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. No invitee-side persistence beyond the
suggestion row — no accounts, no tokens that grant the invitee state, no
calendar access. Anything drifting toward mutual mode is out of scope.

# Task 24: ICS always attached on confirmation emails

Overnight-safe.

## Goal
ARCHITECTURE.md promises "plain ICS always attached; never rely on Google
auto-add." Today `src/jobs/invite-email.ts` attaches the ICS only when the
Google Calendar write failed. Attach it on every created and rescheduled
email regardless of the Google outcome.

## Spec
- In the invite-email job, decouple the ICS attachment decision from the
  Google write result: `created` and `rescheduled` emails always carry the
  ICS attachment, so `composeInviteEmail` gets the default attachment
  wording ("A calendar file is attached") on those kinds. `cancelled`
  behavior is unchanged.
- Keep the UID exactly as it is (`${booking.id}@scheduling-platform`) —
  stable across create/reschedule so re-imports update rather than
  duplicate.
- The `icsAttached` flag on `composeInviteEmail` and its existing tests
  stay: the pure function still supports both wordings; only the job's
  choice of flag changes. When the Google write succeeded AND the ICS is
  attached, the wording should still be the attachment line, not the
  "Google sends the native invite" line — the attachment is now the
  guaranteed artifact. Add a short comment in the job explaining why
  (native invite can be filtered/misdelivered; the ICS is the fallback the
  invitee always has).
- Tests: NEW file (e.g. `tests/core/invite/ics-always.test.ts` or a jobs
  test following the existing invite-email test's mocking pattern)
  asserting: Google-success path still produces an ICS attachment on
  created and rescheduled; cancelled unchanged; UID stable across a
  reschedule of the same booking.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files —
`tests/core/invite/email-google-invite.test.ts` pins the pure function's
flag behavior and must pass untouched. No changes to `src/core/invite/ics.ts`
output format beyond what the spec requires (ideally none).

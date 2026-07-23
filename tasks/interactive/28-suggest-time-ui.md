# Task 28: "Suggest a different time" — invitee UI

INTERACTIVE-ONLY — visual judgment required; never queue for the overnight
loop. Depends on task 25 (suggestions endpoint).

## Goal
An invitee who can't find a workable slot has a graceful exit that keeps the
conversation alive instead of losing the booking.

## Spec
- On the public booking page's pick step, a quiet affordance below the slot
  area: "None of these work? Suggest a time." It must not compete with the
  primary flow — text link or ghost button, not a peer of the slot buttons.
- Clicking it swaps the slot picker for a suggestion form (same step
  pattern as details): name, email, 1–3 proposed windows (date + start
  time in the invitee's selected timezone; end derived from the event
  type's duration), optional message (the Notes textarea idiom,
  maxLength 1000).
- Client converts invitee-local date+time to UTC ISO with Temporal via the
  helpers in `web/src/lib/time.ts` (extend there if needed — no ad-hoc
  Date math), posts to `POST /event-types/:slug/suggestions`.
- Success state mirrors the booking confirmation card: "Sent. <Host/team>
  will get back to you at <email>." Rate-limit 429 and validation errors
  render inline, form state preserved.
- Past-time selection is prevented client-side and still handled if the
  server rejects it.
- Mobile: single column, no horizontal overflow at 390px.

## Acceptance
```
bun run verify
```
Plus human review of desktop + mobile screenshots before merge.

## Constraints
Do not modify existing test files. No invitee accounts, no persistence in
the client beyond form state. This is a one-shot message to the host, not a
negotiation surface.

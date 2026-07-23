# Task 19: Group booking invitee UI

INTERACTIVE-ONLY — visual judgment required; never queue for the overnight
loop. Depends on task 18 (selectableHosts + quorum in the API).

## Goal
An invitee on a public group booking page can pick who the meeting needs,
mark each picked person required or optional, and — when no time clears all
required hosts — see best times for n-1 with the missing person named.

## Spec
- Booking page (`web/src/pages/booking-page.tsx`): when the meta response
  carries `selectableHosts`, render a people picker above the slot picker.
  Reuse the chip/search interaction style of
  `web/src/components/people-picker.tsx` (that component reads the
  authenticated directory; this one is fed by `meta.selectableHosts` — a
  small public variant, avatars included, is fine).
- Per selected host, a required/optional toggle, defaulting to the role the
  API reports. Selection changes re-query availability with `hosts[]`
  (`getAvailability` in `web/src/lib/api.ts` already supports it) and reset
  the slot picker the same way timezone changes do (key remount).
- Selected hosts thread through the whole flow: availability → `createHold`
  → `confirmBooking` (both already accept `hosts[]`).
- Quorum surface: when the availability response has no full slots but
  carries `quorum`, render a distinct block — "No time works for everyone.
  Best times without <name>:" — with that fallback's slots bookable
  (booking then proceeds with the n-1 host set). Visually subordinate to
  the normal best-times block; it is a fallback, not the default.
- Mobile: picker stacks above the calendar, single column, no horizontal
  overflow at 390px.
- Unit-testable pieces (host-set state reducer, role toggling, quorum
  presence logic) get tests under `tests/` only if extracted as pure
  helpers; visual verification is by screenshot review with a human.

## Acceptance
```
bun run verify
```
Plus human review of desktop + mobile screenshots before merge.

## Constraints
Do not modify existing test files. Respect the API's `hosts_not_selectable`
403 as a rendered error, not a crash.

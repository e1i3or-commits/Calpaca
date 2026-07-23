# Task 27: Admin bookings view (dashboard)

INTERACTIVE-ONLY — visual judgment required; never queue for the overnight
loop. Depends on tasks 20 (assignment endpoint), 21 (delivery log), 23
(bookings endpoints + no-show).

## Goal
A host sees their bookings in the dashboard: what's coming, what happened,
whether the invite landed, who round-robin picked and why, with a no-show
action.

## Spec
- New "Bookings" section in `web/src/pages/dashboard-page.tsx` (or an
  extracted page component if dashboard-page is getting unwieldy — it is
  ~1500 lines; extraction is acceptable, restructuring beyond that is not).
- List view over `GET /api/me/bookings`: upcoming/past tabs, status badge,
  invite delivery badge from `inviteStatus` (none/sent/delivered/failed —
  failed is visually loud, it means the invitee likely has no invite),
  times rendered in the viewer's timezone.
- Detail view over `GET /api/me/bookings/:id`: invitee details + notes,
  the full event timeline (kind + createdAt, payload summarized), Google
  event indicator, routing answers when present.
- For round-robin bookings, an assignment panel over
  `GET /api/me/bookings/:id/assignment`: winner with reason, ranked
  candidates with effective loads. Absent (404 no_assignment) renders
  nothing, not an error.
- No-show button on past confirmed bookings → `POST .../no-show` with a
  confirm dialog; 409 responses render the state-machine reason.
- Webhook delivery visibility can link from the existing webhook admin UI
  to `GET /api/me/webhooks/:id/deliveries` — a simple recent-deliveries
  table (status, event, attempts, last error, timestamps).
- Client API functions added to `web/src/lib/api.ts` mirroring the Zod
  contracts.

## Acceptance
```
bun run verify
```
Plus human review of desktop + mobile screenshots before merge.

## Constraints
Do not modify existing test files. Match the existing dashboard idiom
(shadcn/ui, existing card/table patterns). No new npm dependencies.

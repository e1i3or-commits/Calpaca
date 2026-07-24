# Handoff snapshot — 2026-07-22

Point-in-time state for whoever (human or agent) picks this repo up.
Standing rules live in `CLAUDE.md` and `AGENTS.md`; this file is only the
"where were we."

## Shipped and live

Prod = `cal.tourscale.com`, deployed from the pre-public-history equivalent of
commit `edb028e`. Phase 1 (core
engine) and Phase 2 (surfaces) are complete — see `BACKLOG.md` for the
itemized list. Most recent work, all verified live in prod:

- `085bfd2` — Google Calendar write-through: bookings create real events on
  the host's calendar (host as organizer, `sendUpdates=all` so Google sends
  the native invite), reschedule patches, cancel cancels, every Google
  failure degrades to an ICS-attachment email.
- `6d8d302` — booking page redesign: profile header, "Best times" top-3,
  month calendar with tap-day → time grid.
- `edb028e` — optional invitee Notes field; surfaces in invite email,
  Google event description, and ICS fallback.

## Phase 3 progress

A planning session on 2026-07-22 produced Phase 3A/3B task files. Tasks 15–19
were subsequently reviewed, implemented, and verified in an interactive
session:

- agent-policy API enforcement;
- MCP read/write tools and client documentation;
- group-availability API roles and quorum responses;
- group-booking host selection and quorum UI;
- HTML-formatted booking emails with linked actions.

The public repository is
[`e1i3or-commits/Calpaca`](https://github.com/e1i3or-commits/Calpaca).
Remaining queue items still require normal review before execution.

## Product decisions

1. **Name + license — decided:** Calpaca, GNU AGPL v3.
2. **Agent policy trust model — decided for v1:** tasks 15–17 use a self-declared
   `agent: true` flag (cooperating MCP server + rate limiting as backstop).
   API-key-gated agent traffic remains a possible later hardening step.
3. **"Tokenized" suggest-a-time form** (tasks 25/28): specced as a public
   endpoint protected by rate limiting, no token. If a capability-token
   link was intended, those two tasks need revision.
4. **Funnel analytics**: no page-/slot-view impression events exist, so the
   funnel view is impossible without adding client-side tracking. Task 26
   ships the other four views; funnel parked in v2 candidates.
5. **ICS behavior — decided:** attach ICS only when Google Calendar event
   creation fails, avoiding duplicate native and imported events. Task 24 was
   removed.
6. **Rate-limit defaults** (tasks 22/25): holds 20/min/IP, bookings
   10/min/IP, suggestions 5/min/IP, active-holds ceiling 50 per event
   type — all env-overridable. Sanity-check the numbers.

## Known environment quirks

- Playwright MCP is broken on the NixOS dev host (hardcoded Chrome path);
  use `chromium --headless --screenshot=… --window-size=W,H
  --virtual-time-budget=8000 <url>` for page screenshots. Chrome clamps
  window width to ~500px minimum, so 390px "mobile" shots render wide —
  that is not a CSS bug.
- Prod availability starts ~9 days out for the test event type (minimum
  notice + schedule); query a wide window before concluding "no slots."
- `psql -tAc` with multiple statements runs them as one implicit
  transaction — one statement per invocation when that matters.

## Uncommitted implementation-plan migration, 2026-07-24

The frozen UX migration backlog in
`docs/CALPACA-IMPLEMENTATION-PLAN.md` is implemented through L-06. This
includes all Quick Wins, Small, Medium, and Large tickets:

- durable organizer routes and a four-destination mobile shell;
- focused event-type new and edit routes;
- durable meeting-detail routes;
- separately scoped account profile, workspace general, API, people, and
  calendar destinations;
- context-prefilled availability diagnostics;
- the accessibility, recovery, loading, validation, empty-state, poll, and
  mobile-target corrections recorded in the plan.

Each completed ticket has browser evidence under
`docs/screenshots/migration-plan/`. The final verification gate passes with
511 tests, zero failures, plus TypeScript and ESLint.

No commit, push, or deployment was performed during this migration session.

E-01 through E-04 are now implemented. E-01 adds the Client and Engagement schema,
tenant-scoped API, draft-preserving creation flow, list, and overview. E-02
adds Conversation metadata over event types, readiness enforcement, reusable
workspace playbooks, and Engagement-scoped Conversation list and editor
routes. Event types remain the availability and booking source of truth.
E-03 adds deterministic explanations and calendar-evidence confidence to
recommended booking times without changing eligibility or ranking. Existing
links and booking behavior are unchanged. E-04 adds Engagement-scoped
Proposals with internal confirmation, explained options, queued client
delivery, public alternative requests, and atomic conversion through the
existing hold and booking transaction. The remaining plan consists of E-05
through E-08.

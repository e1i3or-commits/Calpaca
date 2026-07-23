# Handoff snapshot — 2026-07-22

Point-in-time state for whoever (human or agent) picks this repo up.
Standing rules live in `CLAUDE.md` and `AGENTS.md`; this file is only the
"where were we."

## Shipped and live

Prod = `cal.tourscale.com`, deployed at commit `809cb3b`. Phase 1 (core
engine) and Phase 2 (surfaces) are complete — see `BACKLOG.md` for the
itemized list. Most recent work, all verified live in prod:

- `3276b83` — Google Calendar write-through: bookings create real events on
  the host's calendar (host as organizer, `sendUpdates=all` so Google sends
  the native invite), reschedule patches, cancel cancels, every Google
  failure degrades to an ICS-attachment email.
- `bd14fc3` — booking page redesign: profile header, "Best times" top-3,
  month calendar with tap-day → time grid.
- `809cb3b` — optional invitee Notes field; surfaces in invite email,
  Google event description, and ICS fallback.

## Pending review (NOT approved to run)

A planning session on 2026-07-22 produced Phase 3A/3B task files:

- `tasks/queue/15–26` (11 overnight-safe tasks) and
  `tasks/interactive/19,27,28` (3 UI tasks needing a human).
- **Kai has not reviewed these yet. Do not launch the overnight loop until
  he approves — the loop pulls whatever is lowest-numbered in
  `tasks/queue/`.**
- Recon notes are baked into each task file (what already exists vs. what
  the task adds). BACKLOG.md was rewritten to match.

## Open product decisions (blocking, need Kai)

1. **Project name + license** (AGPL vs MIT; ARCHITECTURE.md leans AGPL) —
   blocks Phase 3C repo split and CONTRIBUTING.md.
2. **Agent policy trust model**: tasks 15–17 spec a self-declared
   `agent: true` flag (cooperating MCP server + rate limiting as backstop).
   Alternative — API-key-gated agent traffic — was not chosen; revisit if
   unacceptable.
3. **"Tokenized" suggest-a-time form** (tasks 25/28): specced as a public
   endpoint protected by rate limiting, no token. If a capability-token
   link was intended, those two tasks need revision.
4. **Funnel analytics**: no page-/slot-view impression events exist, so the
   funnel view is impossible without adding client-side tracking. Task 26
   ships the other four views; funnel parked in v2 candidates.
5. **ICS-always + native Google invite** (task 24): invitee gets both the
   native invite and an attached .ics (different UID) — importing both
   duplicates the event. ARCHITECTURE mandates always-attach; confirm.
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

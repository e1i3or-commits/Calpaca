# Backlog

Phase 1 tasks exist as individual files in `tasks/queue/` for the overnight
loop. Phases 0 and 2+ are listed here for planning; convert to task files when
their phase starts.

## Phase 0: Recon (human + interactive Claude Code, ~1 week)

- Deploy Cal.diy and Easy!Appointments on the Hetzner box. Book against them.
- Document every availability edge case they handle or fumble: DST
  transitions, overlapping calendars, buffer collisions, minimum notice at
  midnight boundaries, rolling window ends mid-day.
- Output: `docs/EDGE-CASES.md`. This document seeds the Phase 1 test suites.
- Decide the license (AGPL vs MIT) and the project name. Record rationale.

## Phase 1: Core engine (overnight loop, tasks/queue/)

01. Repo scaffold: Bun + TypeScript + Hono skeleton, verify script wiring
02. Test harness and DST fixture library
03. Result type and core utilities
04. Drizzle schema + first migration
05. Interval math: merge, subtract, intersect (pure)
06. Rule expansion: working hours to open intervals, timezone-correct (pure)
07. Slot generation: discretize, buffers, minimum notice, rolling window (pure)
08. Scoring engine: fragmentation, adjacency, time-of-day, focus blocks (pure)
09. Group availability: N-host intersection, required/optional, quorum fallback (pure)
10. Round robin assignment: weighted least-recently-booked, OOO handling (pure)
11. Booking event log: append, project, reschedule/cancel state machine
12. Transactional hold + confirm flow against Postgres
13. Availability API endpoint wiring (GET /availability with hosts[])
14. Hold + booking API endpoints with signed reschedule/cancel tokens

## Phase 2: Surfaces (interactive sessions, human eyes required)

- Google OAuth via BetterAuth; calendar connection flow
- Google sync worker: watch channels, renewal job, invalidated-token full
  resync, busy cache maintenance
- Booking page: curated top-3 scored slots, "show all times," invitee-local
  time everywhere, outside-reasonable-hours warning, email typo detection
- ICS generation and email send; invite delivered status; webhook emission
- Host dashboard: event types, schedules, team management, people picker
- Routing forms UI + rules evaluation endpoint
- Theming: token file system, 2-3 bundled themes
- pg-boss jobs: reminders, hold expiry, channel renewal

## Phase 3: Reach

- MCP server package (tools over the existing API; agent policy enforcement)
- Embeds (script tag + iframe modes)
- Analytics SQL views documented; optional Metabase recipe
- Public API docs; OpenAPI generation from Hono/Zod
- Docker Compose release artifact; README with the two-container pitch
- Repo hygiene for OSS launch: CONTRIBUTING.md with dependency ceiling and
  512MB RAM target stated as policy, issue templates, license file

## v2 candidates (explicitly deferred)

- Mutual mode (invitee OAuth, consent flow, second sync surface)
- Microsoft Graph, CalDAV
- Weighted routing beyond rules AST (skill tags, load-aware)
- Analytics UI

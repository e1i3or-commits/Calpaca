# Backlog

Phase 3A/3B work is tracked in individual files: automation-safe items in
`tasks/queue/` (the loop pulls the lowest number), interactive-only ones in
`tasks/interactive/` (human present, visual review — the loop never reads
this directory). Numbering is one sequence across both. Phase 3C is listed
here; convert to task files when it starts.

## Phase 0: Recon — DONE

`docs/EDGE-CASES.md` seeded the Phase 1 test suites. The public project is
Calpaca and uses the GNU AGPL v3.

## Phase 1: Core engine — SHIPPED (tasks/done/01–14)

Scaffold, DST fixtures, Result type, schema, interval math, rule expansion,
slot generation, scoring, group availability with quorum fallback, weighted
round robin, event-log booking lifecycle, transactional holds, availability
and booking endpoints with signed tokens.

## Phase 2: Surfaces — SHIPPED

- Google OAuth via BetterAuth; calendar connection flow
- Google sync: watch channels + renewal, busy cache, full-resync path;
  write-through — bookings create real Google events (native invites via
  sendUpdates), reschedule patches, cancel cancels, ICS email fallback
- Booking page: profile header, scored "Best times" top-3, month calendar,
  invitee-local time, off-hours warning, email typo detection, invitee notes
- Invite/reminder emails (SES); ICS on the fallback path; delivery-status
  ingestion (normalized via n8n → invite_delivered/invite_failed)
- Outbound webhooks for created/rescheduled/cancelled: HMAC signatures,
  pg-boss retries, admin CRUD
- Host dashboard: event types, schedules, teams, people picker, routing
  form builder, calendar connections
- Routing forms (condition AST) + public /r/<slug> flow
- Theming tokens + per-event-type themes
- pg-boss jobs: reminders, hold expiry, channel renewal

## Phase 3A: Differentiators (tasks 15–20)

15. Agent policy enforcement in the existing API — DONE
16. MCP server package: scaffold + read tools — DONE
17. MCP server: write tools + policy conformance + docs/MCP.md — DONE
18. Group booking public API: selectableHosts meta + quorum in availability
    response — DONE
19. Group booking invitee UI: people picker, required/optional, quorum
    surface — DONE
20. Round-robin transparency: persist explainAssignment at confirm, admin
    endpoint (queue)

## Phase 3B: Production trust and safety (tasks 21–28)

21. Webhooks on every booking event kind + webhook_deliveries log table +
    admin delivery listing (queue)
22. Rate limiting POST /holds + /bookings, per-event-type active-holds
    ceiling, hold-expiry reaping under load (queue)
23. Admin bookings endpoints (list/detail with event timeline and invite
    delivery status) + no-show action (queue)
24. ICS always attached on created/rescheduled emails (queue)
25. "Suggest a different time": public endpoint, host email, webhook event
    — not mutual mode (queue)
26. Analytics SQL views: outcomes, no-show rate, lead time, round-robin
    distribution + docs/ANALYTICS.md (queue)
27. Admin bookings dashboard view: list/detail, delivery badge, no-show,
    assignment panel, webhook deliveries (interactive)
28. Suggest-a-time invitee form on the booking page (interactive)

## Phase 3C: OSS launch readiness (convert to task files when 3A/3B land)

- Analytics exposure: read-only admin page over the task-26 views
  (interactive). Funnel stays blocked on the open decision about
  page/slot-view tracking — no impression events exist.
- Theming system: document the token file, extract remaining hardcoded
  styles into it, ship two additional bundled themes as proof.
- Deployment generalization: move operator-specific deployment config
  (domains, Infisical paths, compose production values) out of the product
  tree; generic docker-compose.example.yml + .env.example; README
  quickstart targeting "first booking page in under a minute."
- Public repository basics — README quickstart, contribution policy, Calpaca
  name, and AGPL decision — DONE. Remaining: 512MB target validation, issue
  templates, and a vendored license text.
- Embeds (script tag + iframe modes); OpenAPI generation from Hono/Zod.

## Explicitly out of scope (budget defense — reject drift toward these)

Mutual mode / invitee calendar OAuth, Microsoft Graph, CalDAV, payments,
native video, CRM integrations, plugin system, integration marketplace,
Redis or any non-Postgres infrastructure, multi-database support.

## v2 candidates (explicitly deferred)

- Mutual mode (invitee OAuth, consent flow, second sync surface)
- Microsoft Graph, CalDAV
- Weighted routing beyond rules AST (skill tags, load-aware)
- Booking-funnel impression tracking (prerequisite for the funnel view)

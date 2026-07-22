# Architecture

## Positioning

Open source, self-hosted scheduling. Solo links, round robin, group booking
(combined availability across selected people), routing forms. Google Calendar
only in v1. Headless-first, MCP-native, scored slots instead of a slot wall.

The pitch: one Docker Compose file, two containers, under a minute to first
booking page. Runs alongside Postgres in under 512MB. The lightweight budget is
a public commitment, not an internal preference.

## Layer model

```
Clients (thin, replaceable)
  booking UI (reference client) | MCP server | embeds | [v2: mutual mode]
        |
API layer (Hono)
  one contract for every client; webhooks exit here to n8n
        |
Core engine (pure functions, src/core/)
  availability + scoring | booking lifecycle (event log) | assignment
        |
Postgres (the only dependency)
  data, append-only event log, pg-boss job queue, Google sync cache
```

The feature test: does a request live inside the core as pure logic, or does
it add a container, a dependency, or a sync surface? The first kind is cheap.
The second kind must justify itself against the budget. Mutual mode (invitee
OAuth) is the only currently planned second-kind feature and is deferred to v2.

## Core engine modules

### Availability (src/core/availability/)

Input: busy intervals (from cache), working-hours rules, event type config
(duration, buffers, minimum notice, rolling window, per-day caps), a query
window, and for group queries an array of host availability sets.

Pipeline: expand rules to open intervals -> subtract busy -> apply buffers and
notice -> discretize into candidate slots -> score -> return ranked slots.

Scoring is a ranking pass over the same output, not separate machinery.
Signals in v1:
- fragmentation penalty (a booking that splits a large open block scores low)
- adjacency bonus (back-to-back with existing meetings scores high)
- time-of-day weights (per-host preference, e.g. mornings down-weighted)
- soft-protected focus blocks (available only when little else is)

The default booking page shows the top 3 scored slots with "show all times"
one click away. The slot wall is the fallback view, not the default.

### Booking lifecycle (src/core/booking/)

Append-only event log: `booking_events` is the source of truth
(created, rescheduled, cancelled, reassigned, no_show, invite_sent,
invite_delivered). Current state is a projection. This is a deliberate answer
to the zombie-reschedule bug class seen in incumbents, and it makes the
analytics pipeline a set of SQL queries over tables that already exist.

Double-booking prevention: transactional slot hold at confirmation
(SELECT ... FOR UPDATE on the hold row, re-verify availability inside the
transaction, then confirm). Postgres row locking is why SQLite support is
permanently out of scope.

Trust details that are product features here:
- invitee email typo detection at booking + visible invite delivered status
- plain ICS always attached; never rely on Google auto-add
- reschedule/cancel via signed tokens in email links
- invitee-local time displayed on both sides; bookings landing outside the
  invitee's reasonable local hours get a confirmation warning

### Assignment (src/core/assignment/)

Three modes over one availability engine:
- solo: one host
- round robin: "any one of these hosts." Team-wide availability is computed
  FIRST, assignment happens at confirmation via weighted least-recently-booked.
  This is the deliberate inverse of the incumbent pattern (pick host first,
  show only their slots) that produces unfair distribution and hidden
  availability. Explicit out-of-office handling; no silent starvation; the
  distribution algorithm is documented user-facing.
- group booking: "all of these hosts." Intersect required hosts' availability;
  optional attendees affect scoring, not eligibility. Quorum fallback: when the
  full intersection is empty in the window, return best slots for n-1 with the
  missing person identified. Round robin and group booking are the same engine
  with different set operations (union-of-any vs intersection-of-all).

Routing: a rules table mapping form answers to event types/hosts, evaluated as
a pure function. Skill/attribute routing, not just rotation (the GitLab
lesson: fair distribution matters less than whether the assigned host can
actually serve the meeting).

Directory scoping: group booking with a people picker is authenticated-only by
default. Exposing a selectable group on a public link is explicit per-page
configuration listing who is selectable. Combined availability leaks
information; internal-first, opt-in outward.

## Google Calendar sync (src/sync/)

The least glamorous, highest-bug-risk area. Design:
- OAuth via BetterAuth; calendar scopes on the same flow as sign-in.
- Busy blocks cached in `calendar_busy_cache`; slot generation never calls
  Google on the request path.
- Incremental sync via watch channels. Channels expire (~7 days max) and are
  renewed by a pg-boss scheduled job. Sync tokens can be invalidated by
  Google, forcing a full resync; this path is tested, not hoped about.
- Every sync failure mode degrades to "stale but flagged," never to "silently
  wrong availability."

## API layer (src/api/)

Hono routes, Zod-validated, one contract consumed by the booking UI, the MCP
server, and embeds. Key endpoints:
- GET  /availability?eventType=&hosts[]=&window=   (hosts[] enables group)
- POST /holds        (transactional slot hold, short TTL)
- POST /bookings     (confirm hold)
- POST /bookings/:id/reschedule | /cancel   (signed-token auth)
- GET  /event-types, CRUD for authenticated hosts
- POST /routing/evaluate
- Webhook emission on every booking event. Webhooks + n8n are the extension
  boundary. There is no plugin system and no native integration marketplace.

## MCP server (src/mcp/)

A second thin client over the same API. Tools: query availability (solo and
group), propose/confirm holds, book, reschedule, cancel. Governed by per-event-
type agent policy: which agents, which windows, whether unconfirmed holds
auto-expire. The group case ("book 30 minutes with these three people this
week") is the flagship agent demo.

## Analytics

A byproduct of the event log: booking funnel (page views, slot views,
drop-off), no-show rates, lead time distribution, round robin distribution
fairness. Ship as documented SQL views in v1; UI later or point Metabase at it.

## Explicitly out of scope (budget defense)

Native video (a Meet link is enough), payments, CRM integrations, plugin
system, integration marketplace, multi-database support, Redis or any broker,
Microsoft Graph and CalDAV (Phase 3+ at earliest), mutual mode (v2).

## Licensing

Decide before the repo is public. AGPL prevents a hosted fork from closing the
commons (the Cal.com lesson) at the cost of some corporate adoption; MIT
maximizes adoption. Default recommendation: AGPL, given no plan to monetize
hosting. Record the decision and rationale in the repo.

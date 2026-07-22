# Task 13: Availability API endpoint

## Goal
GET /availability wired through the whole core: the first end-to-end proof.

## Spec
- Route in src/api/routes/availability.ts, Zod-validated query:
  eventTypeSlug, hosts[] (optional; presence switches solo -> group),
  window start/end, inviteeTimezone.
- Handler loads event type + hosts + schedules + busy cache via repos
  (src/db/availability-repo.ts, created here), runs rules -> subtract ->
  slots -> (group?) -> scoring, returns { curated: top N, all: [...] } with
  every time rendered BOTH as UTC and in invitureeTimezone, plus
  localHourWarning: true on slots outside 07:00-21:00 invitee-local.
- Respect eventTypes.publicSelectableHostIds: hosts[] entries not in the
  allowlist on an unauthenticated request return 403.
- Tests: route-level via app.request() with repos stubbed (inject repo
  functions; do not mock module internals), covering solo, group, curated
  count, timezone rendering, the allowlist 403, and the local-hour warning.

## Acceptance
```
bun run verify
```

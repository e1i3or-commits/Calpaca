# Task 18: Group booking public API — selectable hosts and quorum fallback

Overnight-safe. This is the API half of the group-booking invitee UI
(task 19, interactive); it must not touch `web/`.

## Goal
A public booking page can render a people picker and a quorum fallback from
data the API already computes but currently drops.

## Spec
- `GET /event-types/:slug` gains an optional `selectableHosts` array,
  present only when the event type mode is `group` and
  `publicSelectableHostIds` is non-empty: `{ id, name, image, role }` per
  allowlisted host (role from `event_type_hosts`: required/optional;
  `member` maps to required, same rule as `groupHostRole` in the
  availability route). Conditional spread — existing tests pin the exact
  meta keys and the `profile.hosts` object shape (`[image, name]` only);
  neither may change. Host emails stay private.
- `GET /availability` for group queries: `groupAvailability` in
  `src/core/availability/group.ts` already returns quorum fallbacks
  (`{ missingUserId, slots }`) when the full required-host intersection is
  empty; the route keeps only `.full`. When the full result is empty and
  fallbacks exist, add to the response, via conditional spread:
  `quorum: { missingHost: { id, name }, slots }` — the highest-scoring
  fallback, slots rendered through the same DTO pipeline as `all`
  (UTC + invitee timezone, scores, localHourWarning). When full
  availability exists, no `quorum` key.
- Tests in NEW file `tests/api/group-availability.test.ts`:
  `selectableHosts` present with expected members/roles for a group event
  type with an allowlist; key absent for solo event types and for group
  types with an empty allowlist; a fixture where required hosts have no
  common slot yields `quorum` naming the missing host with non-empty slots;
  a fixture with a common slot yields no `quorum` key.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. Do not change the `profile` object or any
existing response key. Pure additive response surface.

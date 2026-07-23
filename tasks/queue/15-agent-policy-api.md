# Task 15: Agent policy enforcement in the existing API

Overnight-safe.

## Goal
`event_types.agent_policy` (already in the schema, currently unenforced)
becomes real: agent-originated calls against disabled event types are
rejected, agent holds get a shorter leash. No new endpoints — this prepares
the ground for the MCP server (tasks 16/17), which is a client.

## Spec
- The schema column exists: `eventTypes.agentPolicy` jsonb
  `{ enabled: boolean; autoExpireHoldsMin?: number }`, default
  `{ enabled: false }`. Do not change it.
- `POST /holds` and `POST /bookings` bodies gain an optional
  `agent: z.literal(true).optional()` field. When `agent` is set and the
  event type's `agentPolicy.enabled` is false, respond
  `403 { error: "agent_not_allowed" }` before any hold/booking work.
- When `agent` is set, policy enabled, and `autoExpireHoldsMin` is present,
  clamp the hold TTL passed to `createHold` to
  `min(standard TTL, autoExpireHoldsMin minutes)`. The existing
  `expireHolds` reaper needs no changes.
- Expose the policy on the public meta endpoint so agent clients can
  pre-check: `GET /event-types/:slug` gains `agentPolicy: { enabled }` via
  conditional spread (`...(row.agentPolicy ? { agentPolicy: { enabled:
  row.agentPolicy.enabled } } : {})`). Existing tests pin the exact meta
  response keys with fixture rows that lack the field — the conditional
  spread is what keeps them green. Add `agentPolicy` as an OPTIONAL readonly
  field on the availability-repo event-type row types and map it from the db
  row in the real repo.
- Admin event-type CRUD (`/api/me/event-types`) accepts and returns
  `agentPolicy` (zod: `{ enabled: boolean, autoExpireHoldsMin?: int 1..1440 }`)
  so hosts can turn it on.
- Tests in NEW file `tests/api/agent-policy.test.ts`: disabled policy rejects
  agent hold and agent confirm with 403; non-agent requests to the same
  event type unaffected; enabled policy with autoExpireHoldsMin=5 produces a
  hold whose expiresAt is ≤ 5 minutes out; meta includes `agentPolicy` when
  the row carries it and omits the key when it does not.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. Do not add endpoints. The `agent` flag is
self-declared by cooperating clients (our MCP server); that is the accepted
trust model — do not invent API-key machinery.

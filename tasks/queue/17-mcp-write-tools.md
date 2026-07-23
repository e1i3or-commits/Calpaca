# Task 17: MCP server — write tools and agent-policy conformance

Overnight-safe. Depends on tasks 15 and 16.

## Goal
The flagship agent flow works end to end over MCP: query availability, hold,
book, reschedule, cancel — with agent policy honored on every write.

## Spec
- Extend `src/mcp/server.ts` with write tools, all sending `agent: true` in
  the request body (task 15 contract):
  - `create_hold` (`eventTypeSlug`, `start`, `end`, optional `hosts[]`) →
    `{ holdIds, expiresAt }`.
  - `confirm_booking` (`eventTypeSlug`, `holdIds`,
    `invitee: { email, name, timezone, notes? }`) → booking id, reschedule
    and cancel tokens, start/end in both renderings.
  - `reschedule_booking` (`bookingId`, `rescheduleToken`, `start`, `end`).
  - `cancel_booking` (`bookingId`, `cancelToken`, optional `reason`).
- API errors surface as MCP tool errors carrying the API error code verbatim
  (`slot_taken`, `agent_not_allowed`, `expired`, ...) so the calling agent
  can react; never swallow them into generic failures.
- Tests in NEW file `tests/mcp/write-tools.test.ts`, same fixture pattern as
  task 16: full happy path hold → confirm → reschedule → cancel against the
  in-process app; `create_hold` against a policy-disabled event type returns
  the `agent_not_allowed` tool error; with `autoExpireHoldsMin` set, the
  returned `expiresAt` is within that many minutes of now.
- `docs/MCP.md`: what the server is (a client over the public API), the env
  contract (`SCHEDULER_API_URL`), a `claude mcp add` one-liner and the
  equivalent Claude Desktop JSON block, the tool list with one-line
  descriptions, and the agent-policy behavior (disabled by default per event
  type, holds auto-expire).

## Acceptance
```
bun run verify
```

## Constraints
Same as task 16: no new API endpoints, no imports from `src/db|api|core`
inside `src/mcp/`, do not modify existing test files.

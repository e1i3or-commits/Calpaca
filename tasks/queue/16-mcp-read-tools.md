# Task 16: MCP server package — scaffold and read tools

Overnight-safe. Depends on task 15 (meta exposes `agentPolicy`).

## Goal
`src/mcp/` exists as a second thin client over the same API (ARCHITECTURE.md
layer model). This task ships the server scaffold plus the read-only tools;
task 17 adds the write tools.

## Spec
- New dependency `@modelcontextprotocol/sdk` — pre-approved by the Phase 3
  planning session; cite that in the justification. If its zod peer
  requirement conflicts with the repo's zod major, pin the newest SDK
  version that matches. No other new dependencies.
- `src/mcp/server.ts`: `createSchedulerMcpServer(deps: { baseUrl: string;
  fetch: typeof fetch })` returning the SDK server. Every HTTP call goes
  through `deps.fetch` against `deps.baseUrl` using the existing public API
  contract (`GET /event-types/:slug`, `GET /availability`) — the MCP server
  is a client, it imports nothing from `src/db/` or `src/api/`.
- Tools (zod input schemas, structured JSON results):
  - `get_event_type` (`slug`) → the meta response: title, duration, profile,
    `agentPolicy` when present.
  - `query_availability` (`eventTypeSlug`, `start`, `end`,
    `inviteeTimezone`, optional `hosts: string[]` for group queries) →
    `{ curated, all }` slots, each with both the UTC and invitee-timezone
    renderings the API already returns.
- Both tools refuse event types whose meta reports
  `agentPolicy.enabled === false` (or where `agentPolicy` is absent, since
  the default is disabled) with a clear tool error naming the event type.
  Server-side enforcement from task 15 remains the backstop for writes.
- `src/mcp/index.ts`: stdio transport entrypoint reading
  `SCHEDULER_API_URL` (default `http://localhost:3000`). Env access is fine
  here — this is the process boundary, not core. Add a `"mcp"` script to
  package.json running it.
- Tests in NEW directory `tests/mcp/` (e.g. `tests/mcp/read-tools.test.ts`):
  build the API app fixture the same way `tests/api/*.test.ts` do, adapt
  `app.request` as the injected `fetch`, connect an SDK client over
  `InMemoryTransport.createLinkedPair()`, and assert: availability round
  trip for a policy-enabled event type; refusal for a disabled one; group
  query passes `hosts[]` through.

## Acceptance
```
bun run verify
```

## Constraints
No new endpoints in `src/api/`. Do not modify existing test files. Nothing
under `src/mcp/` may import from `src/db/`, `src/api/`, or `src/core/` —
API responses are the only contract.

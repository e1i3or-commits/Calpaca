# Calpaca MCP server

Calpaca's MCP server is a thin stdio client over the same public HTTP API as
the booking page. It does not connect to PostgreSQL or import the API or core
engine directly.

## Prerequisites

Install the repository dependencies with `bun install` and run or otherwise
provide access to a Calpaca API. The MCP process communicates over standard
input/output, so keep logs and other output off stdout.

## Configuration

`SCHEDULER_API_URL` is the scheduler's public base URL. It defaults to
`http://localhost:3000`.

From the repository root, add the server to Claude Code:

```sh
claude mcp add calpaca -e SCHEDULER_API_URL=https://cal.example.com -- bun run mcp
```

For a local API, use `http://localhost:3000`.

For Claude Desktop, add the equivalent entry to its MCP configuration. Replace
the source path with the absolute path to this checkout:

```json
{
  "mcpServers": {
    "calpaca": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/calpaca/src/mcp/index.ts"],
      "env": {
        "SCHEDULER_API_URL": "https://cal.example.com"
      }
    }
  }
}
```

## Tools

- `get_event_type` — get public metadata for an agent-enabled event type.
- `query_availability` — return curated and complete scored slots in UTC and
  the invitee's timezone.
- `create_hold` — temporarily hold a slot.
- `confirm_booking` — confirm one or more active holds for an invitee.
- `reschedule_booking` — move a booking using its reschedule token.
- `cancel_booking` — cancel a booking using its cancellation token.

## Agent policy

Agent access is disabled by default for each event type. Read tools refuse
event types whose public metadata does not explicitly enable agent access, and
write tools send `agent: true` so the API enforces the same policy.

An event type can set `autoExpireHoldsMin` to shorten agent-created holds. The
API clamps the normal hold lifetime to that value; agents should confirm
promptly and treat the returned `expiresAt` as authoritative.

API error codes are returned unchanged as MCP tool errors. Callers can react to
codes such as `agent_not_allowed`, `slot_taken`, `expired`, and
`invalid_token`.

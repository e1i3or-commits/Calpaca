# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Open source scheduling platform. Lightweight is a hard budget, not a vibe.

## Commands

- `bun run verify` — the whole gate: typecheck, lint, all tests. Must pass from a clean checkout.
- `bun run typecheck` / `bun run lint` / `bun test` — the individual pieces.
- `bun test tests/core/interval-math.test.ts` — single test file; `bun test -t "name"` filters by test name.
- `bash scripts/verify.sh tasks/queue/NN-task.md` — the independent gate the overnight loop runs: repo-wide gate + the task file's `## Acceptance` fenced command verbatim + anti-gaming invariants (no net removal of `expect(` assertions, no `.skip`/`.only`/`todo` in `tests/`).
- `bunx drizzle-kit generate` / `bunx drizzle-kit migrate` — migrations from `src/db/schema.ts` (task 04+).
- `bash scripts/loop.sh` — the overnight runner (humans launch this in the agent container, never Claude; see `README.md` for the full procedure).

## Architecture

Full design in `docs/ARCHITECTURE.md`, schema draft with rationale in
`docs/SCHEMA.md`, phased plan in `BACKLOG.md`. The load-bearing decisions:

- **Layer model:** thin clients (booking UI, MCP server, embeds) → Hono API
  (`src/api/`, one Zod-validated contract for every client) → pure core engine
  (`src/core/`) → Postgres (data + append-only event log + pg-boss queue +
  Google busy cache). New features must live in the core as pure logic; anything
  adding a container, dependency, or sync surface fights the budget.
- **Availability pipeline** (`src/core/availability/`): expand working-hours
  rules to open intervals → subtract busy → apply buffers + minimum notice →
  discretize into slots → score (fragmentation penalty, adjacency bonus,
  time-of-day weights, focus blocks). Scoring is a ranking pass over the same
  output, not separate machinery; the booking page defaults to top-3 scored
  slots, the slot wall is the fallback.
- **Event log is the source of truth:** `booking_events` is append-only;
  `bookings` is a maintained projection and loses on conflict. Analytics are
  SQL views over these tables.
- **Double-booking prevention:** transactional hold at confirmation — unique
  partial index on `(host_user_id, slot_start) WHERE status = 'active'`, taken
  `FOR UPDATE`, availability re-verified inside the transaction. This is why
  Postgres is mandatory and SQLite is permanently out of scope.
- **Assignment** (`src/core/assignment/`) is one availability engine with
  different set operations: round robin = union-of-any (team availability
  computed first, host assigned at confirmation via weighted
  least-recently-booked); group booking = intersection-of-all required hosts
  (optional attendees affect scoring only; quorum fallback returns best n-1
  slots naming the missing person). Routing rules are a condition AST evaluated
  as a pure function.
- **Google sync** (`src/sync/`, Phase 2): slot generation reads only
  `calendar_busy_cache`, never Google on the request path. Watch channels renew
  via pg-boss; every failure mode degrades to "stale but flagged," never
  silently wrong availability.
- **Extension boundary:** webhooks + n8n. No plugin system, no integration
  marketplace, no Redis, no native video/payments/CRM (see ARCHITECTURE.md
  out-of-scope list).

## Overnight harness mechanics

`scripts/loop.sh` pulls the lowest-numbered file from `tasks/queue/`, gives it
to `claude -p` (45 min, max 80 turns), then runs `scripts/verify.sh`
independently. Green → commit + move to `tasks/done/`; 3 failed attempts →
`tasks/blocked/`; 3 consecutive blocked tasks or 8h wall clock aborts the run.
The loop hash-checks `verify.sh`, `loop.sh`, and this file — modifying any of
them fails the task regardless of instructions. Failure output from a prior
attempt is fed into the retry prompt: fix root causes, the same failure will
recur otherwise.

loop.sh is launched by a human from outside any Claude session. Never run it.

## Stack (fixed, do not substitute)

- Runtime: Bun. TypeScript everywhere. No JavaScript files.
- Backend: Hono + Zod. Frontend: React 19 + Vite + TanStack Router (Phase 2+).
- Styling: Tailwind v4 with CSS variable design tokens + shadcn/ui.
- Database: PostgreSQL via Drizzle ORM. Migrations via drizzle-kit.
- Background jobs: pg-boss. There is no Redis and there never will be.
- Auth: BetterAuth with Google OAuth.
- All date/time math: Temporal API. moment, dayjs, date-fns are forbidden.

## Hard budget rules

1. Postgres is the only infrastructure dependency. Adding any service that
   requires a new container is out of scope without explicit human approval.
2. New npm dependencies require justification in the commit message. Prefer
   zero-dependency solutions for anything under ~100 lines.
3. The core engine (`src/core/`) contains only pure functions. No I/O, no
   database imports, no fetch, no environment access. If a core function needs
   data, it takes the data as a parameter.

## Time handling (correctness rules, non-negotiable)

- All storage and computation in UTC. Timezone conversion happens only at
  render/serialization boundaries.
- Use `Temporal.ZonedDateTime` and IANA zone names for any conversion.
- Every slot computation must be DST-safe. There are explicit tests for
  transitions; they define correct behavior.
- Invitee-local time is first class: any API response containing a time
  includes both UTC and the requester-declared timezone rendering.

## Autonomous session rules

You are likely running unattended inside scripts/loop.sh. These rules exist so
the morning review can trust the night's work.

1. Work ONLY on the task file provided in the prompt. Do not start other
   backlog items, do not refactor unrelated code, do not "improve" things the
   task did not ask for.
2. NEVER edit files under `tests/` except when the task file explicitly says
   to create or extend tests. Never weaken, delete, or skip an existing test
   or assertion to make a task pass. If a test seems wrong, write your
   reasoning to `logs/questions.md` and stop work on that task; exiting with
   the task incomplete is the correct behavior.
3. NEVER edit `scripts/verify.sh`, `scripts/loop.sh`, `CLAUDE.md`, or any file
   under `tasks/`. These are the harness, not the project.
4. Definition of done is exactly the task file's acceptance command passing.
   Not "mostly working." Not "done except."
5. Do not run git commit or git push. The loop commits for you after
   independent verification passes.
6. If genuinely blocked (missing information, contradictory requirements),
   append a short note to `logs/questions.md` and exit. Do not guess at
   product decisions.

## Code conventions

- Files kebab-case, exports camelCase, types PascalCase.
- Every module under `src/core/` gets a colocated `.test.ts` in `tests/core/`
  mirroring the path.
- Errors are typed results, not thrown strings: use the `Result<T, E>` helper
  in `src/lib/result.ts` once it exists (task 03).
- No classes where a function will do. No default exports.
- Comments explain why, not what. Sparse.

## Verification

`bun run verify` is the whole gate: typecheck, lint, all tests. It must pass
from a clean checkout. If it passes locally but you changed test files outside
an explicit test task, the loop will still reject the work.

## Operator sessions (interactive, human present)

An interactive session on the deployment box may act as the launch
operator. Operator sessions may:
- build the agent image and verify the toolchain inside it
- create the overnight-net network and start the overnight-db sidecar
- run preflight checks: git state, task queue count, harness syntax,
  pg_isready, uid write test against the mounted repo
- start the overnight loop container and tail its logs
- report status; never interpret or fix task failures mid-run

Operator sessions must NOT: edit anything under scripts/ or tasks/,
edit this file, run loop.sh directly outside its container, delete
containers or volumes, or enable usage spillover / change billing.
The one-time bypass-permissions acceptance dialog requires a human TTY
and is always done by the human.

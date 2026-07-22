# Scheduler Handoff Package

Open source scheduling platform. Working name: pick one before the repo goes public.
Two containers total: app + Postgres. TypeScript on Bun, Hono, React 19 + Vite,
Tailwind v4 + shadcn/ui, Drizzle ORM, pg-boss, BetterAuth, Temporal API.
Google Calendar only in v1.

## Package contents

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Drop in repo root. Conventions and guardrails Claude Code reads every session. |
| `docs/ARCHITECTURE.md` | System design, module boundaries, budget rules. |
| `docs/SCHEMA.md` | Drizzle schema draft with design notes. |
| `BACKLOG.md` | Full phased backlog, Phase 0 through Phase 3. |
| `tasks/queue/` | Phase 1 tasks as individual files, each with acceptance criteria. The overnight loop consumes these in order. |
| `scripts/loop.sh` | The overnight runner. One task per Claude invocation, verify, commit, next. |
| `scripts/verify.sh` | Independent verification gate. Claude never edits this file. |
| `scripts/Dockerfile.agent` | Container the loop runs inside. |

## Overnight run procedure

### 1. One-time setup (do this while awake)

```bash
# On the Hetzner box
git init scheduler && cd scheduler
cp -r /path/to/handoff/{CLAUDE.md,docs,tasks,scripts,BACKLOG.md} .
git add -A && git commit -m "chore: handoff package baseline"
git checkout -b overnight/phase-1

# Build the agent container
docker build -f scripts/Dockerfile.agent -t scheduler-agent .

# Accept the bypass-permissions confirmation ONCE interactively.
# Known gotcha: without this, headless runs can park on a one-time
# confirmation dialog and produce zero work all night.
docker run -it -v "$PWD":/work -e ANTHROPIC_API_KEY scheduler-agent \
  claude --dangerously-skip-permissions -p "print hello and exit"
```

### 2. Launch the loop

```bash
docker network create overnight-net
docker run -d --name overnight-db --network overnight-net \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test postgres:16
docker run -d --name overnight --network overnight-net \
  -v "$PWD":/work \
  -e ANTHROPIC_API_KEY \
  -e TEST_DATABASE_URL=postgres://test:test@overnight-db:5432/test \
  scheduler-agent bash scripts/loop.sh

# Watch it live if you want
docker logs -f overnight
```

Note: with `TEST_DATABASE_URL` set for the whole run, integration tests
execute during verification of every task after 11, not only task 12. That
is intended; it gates tasks 13-14 on the double-booking invariants.

### 3. Morning review (non-negotiable)

The loop produces commits, not merges. Before anything leaves the branch:

```bash
git log --oneline overnight/phase-1        # one commit per green task
cat logs/loop-summary.md                    # what passed, what blocked, attempt counts
ls tasks/blocked/                           # tasks that failed 3x, with failure logs
git diff main...overnight/phase-1 -- tests/ # confirm test assertions were not weakened
bun run verify                              # full gate, from a clean checkout

# Teardown
docker rm -f overnight overnight-db && docker network rm overnight-net
```

Review the diff like it came from a fast, overconfident contractor. Merge what is
good, rewrite task files for what blocked, requeue.

## Safety model

- The container has no production credentials, no Google OAuth secrets, and only
  the project directory mounted. `--dangerously-skip-permissions` is acceptable
  only because the container boundary does the security work.
- The Postgres sidecar (`overnight-db`) is a throwaway database on an isolated
  network with no volume; it is part of the sandbox, not an exception to it.
- `scripts/verify.sh` and everything under `tests/` are the trust anchors.
  CLAUDE.md forbids editing them to make a task pass; verify.sh additionally
  fails any task whose diff touches verify.sh itself.
- Git is the undo button. Every green task is its own commit. Nothing is pushed
  automatically.
- Hard stops: 3 consecutive blocked tasks aborts the run (signals a broken
  environment, not a hard problem), and an 8 hour wall clock cap ends the night.

## Why Phase 1 overnight and not the whole app

Phase 1 is the availability engine and booking lifecycle: pure functions,
deterministic tests, zero visual judgment. That is the ideal shape for
autonomous TDD. The UI (Phase 2 onward) needs human eyes per iteration and
should be built in interactive sessions.

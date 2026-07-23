# AGENTS.md

Instructions for any coding agent working in this repository (Codex, etc.).

**Read `CLAUDE.md` first — every rule in it applies to you verbatim**, not
just to Claude: the hard budget rules, the fixed stack, time-handling
correctness rules, autonomous session rules, code conventions, and the
verification gate. This file only adds what CLAUDE.md doesn't cover:
operational knowledge accumulated in interactive sessions.

## Current state

See `docs/HANDOFF.md` for the point-in-time handoff snapshot (what's
shipped, what's pending review, open product decisions).

## Local development (NixOS host)

Bun is not on PATH; run every bun command through nix:

```sh
nix shell nixpkgs#bun --command bun run verify
```

DB-backed tests need the local test Postgres (skipped cleanly when unset):

```sh
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:5434/test \
  nix shell nixpkgs#bun --command bun run verify
```

## Production deployment

- Prod is live at **https://cal.tourscale.com** — compose stack at
  `/opt/scheduler` on the Hetzner box (`ssh hetzner`): `ts-scheduler-app` +
  `ts-scheduler-db` (postgres:16) on `tourscale-net` behind Nginx Proxy
  Manager. Containers expose no host ports; health-check via the public
  URL, not from inside the box.
- Migrations run on container boot. Secrets come from Infisical
  `/tier5/scheduler` (see the projects-level CLAUDE.md); **never print
  secret values** — pipe them into shell vars or suppress output. SMTP must
  use port 587 STARTTLS (Hetzner blocks 465).
- Deploy procedure (deliberate, in order):
  1. `git push box main:deploy-phase2`
  2. `ssh hetzner "sudo -u kai git -C /opt/scheduler merge --ff-only deploy-phase2"`
  3. `ssh hetzner "cd /opt/scheduler && docker compose -f deploy/compose.yml --env-file .env up -d --build"`
  4. Verify `https://cal.tourscale.com/health` returns 200.
- **Never run git as root on the box** — always `sudo -u kai git -C /opt/scheduler …`.
- Google watch channels are live-verified; prod push notifications need a
  stable public HTTPS `PUBLIC_URL`.

## Overnight loop caveat

`scripts/loop.sh` invokes `claude -p` specifically. Running the overnight
queue under a different agent requires a **human** to adapt that script —
agents must never edit `scripts/loop.sh`, `scripts/verify.sh`, `CLAUDE.md`,
or anything under `tasks/` (see CLAUDE.md harness rules; the loop
hash-checks those files). `tasks/interactive/` holds tasks that need a
human present — the loop only reads `tasks/queue/`.

## Conventions that bite

- Several API tests pin exact response keys
  (`Object.keys(body).sort()` in `tests/api/theming.test.ts`,
  host-object shape in `tests/api/event-type-profile.test.ts`). New
  response fields must be additive behind conditional spreads or optional
  injected deps so fixtures without the field keep passing. Never edit
  existing test files to make room.
- The `bookings` table is a projection; every mutation goes through
  `booking_events` (append-only). Don't write the projection directly.
- Migrations: `bunx drizzle-kit generate` from `src/db/schema.ts`; never
  hand-edit applied migrations.

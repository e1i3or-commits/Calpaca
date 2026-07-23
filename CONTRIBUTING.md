# Contributing to Calpaca

Thanks for helping make scheduling infrastructure smaller, clearer, and more
trustworthy.

## Before you start

Open an issue before beginning a large feature or architectural change.
Bug fixes, tests, and focused documentation improvements can go directly to a
pull request.

Calpaca has a deliberately narrow architecture:

- PostgreSQL is the only infrastructure dependency.
- Background work runs through pg-boss in the application process.
- Core scheduling logic is pure and receives data as arguments.
- Time is stored and computed in UTC; conversions use Temporal and IANA zones.
- Webhooks and n8n are the extension boundary. A plugin marketplace is out of
  scope.
- New runtime dependencies need a concrete justification. Prefer a small local
  implementation when it is easier to audit.

Proposals that add Redis, another database, a separate queue, or another
always-on service should explain why the existing stack cannot meet the need.

## Local setup

Follow the [README quickstart](README.md#quickstart), then create a separate
test database and set `TEST_DATABASE_URL`.

Run the complete gate before submitting:

```sh
bun run verify
```

That command runs TypeScript checks, linting, and the test suite. Tests that
need PostgreSQL skip when `TEST_DATABASE_URL` is unset, so set it when changing
database-backed behavior.

## Code and tests

- Use TypeScript and kebab-case filenames.
- Prefer functions over classes.
- Keep modules in `src/core/` pure: no database, network, filesystem, or
  environment access.
- Add a mirrored test under `tests/core/` for new core modules.
- Never weaken or skip an existing assertion to make a change pass.
- Treat booking events as append-only; mutate bookings through the event log,
  not by writing the projection directly.
- Generate migrations from `src/db/schema.ts` with
  `bunx drizzle-kit generate`; do not hand-edit an applied migration.

All date/time work must be DST-safe. API responses containing a time should
include UTC and the requester-declared timezone representation where
applicable.

## Pull requests

Keep changes focused. Describe:

1. The user-visible outcome.
2. Important design tradeoffs.
3. Verification performed.
4. Any new dependency and why it is necessary.

Do not include credentials, production data, or environment files. Use
`.env.example` for documented configuration.

By contributing, you agree that your contribution is licensed under the
project's GNU Affero General Public License v3.0.

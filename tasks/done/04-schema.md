# Task 04: Drizzle schema + first migration

## Goal
The database schema from docs/SCHEMA.md, compiling and generating a migration.

## Spec
- Implement docs/SCHEMA.md as src/db/schema.ts. Fix any Drizzle API details
  the draft gets wrong (it is a draft; the design intent is binding, exact
  syntax is not). Import sql from drizzle-orm where needed.
- drizzle.config.ts pointing at src/db/schema.ts, out dir drizzle/.
- Generate the migration: `bunx drizzle-kit generate`.
- src/db/client.ts exporting a lazily-created pg Pool + drizzle instance from
  DATABASE_URL.
- A schema test that imports the schema and asserts table objects exist
  (compile-level guarantee; no live DB required for this task).

## Acceptance
```
bun run verify && test -n "$(ls drizzle/*.sql 2>/dev/null)"
```

## Constraints
Do not connect to a live database in tests for this task.

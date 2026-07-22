# Task 01: Repo scaffold

## Goal
Bun + TypeScript project skeleton that `bun run verify` can gate.

## Spec
- `bun init` equivalent structure: package.json, tsconfig.json (strict: true,
  noUncheckedIndexedAccess: true), src/, tests/.
- Hono installed; `src/api/app.ts` exports a Hono app with GET /health
  returning `{ ok: true }`. `src/index.ts` serves it via Bun.serve.
- Install: hono, zod, drizzle-orm, drizzle-kit, pg, pg-boss. Dev: @types/pg,
  eslint + typescript-eslint flat config.
- package.json scripts: `verify` runs typecheck + lint + test (wire to
  scripts/verify.sh), `typecheck`, `lint`, `test` (bun test).
- One smoke test in tests/api/health.test.ts hitting the app via app.request().

## Acceptance
```
bun run verify
```

## Constraints
Do not add dependencies beyond those listed. Do not create UI files.

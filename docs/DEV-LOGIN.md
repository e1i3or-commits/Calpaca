# Dev login

Work on the dashboard locally without Google: sign in as a seeded demo host
backed by a local database.

## Set up

```sh
docker run --name calpaca-postgres -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=app -p 127.0.0.1:5434:5432 -d postgres:16
DATABASE_URL=postgres://test:test@127.0.0.1:5434/app bunx drizzle-kit migrate
DATABASE_URL=postgres://test:test@127.0.0.1:5434/app DISABLE_JOBS=1 bun run seed:dev
```

`seed:dev` creates `host@example.com` ("Demo Host", onboarding finished, a
password login), a Mon–Fri 9–5 schedule and the `/book/intro-call` event type.
It is idempotent.

## Run

```sh
CALPACA_DEV_LOGIN=1 BETTER_AUTH_URL=http://localhost:3000 DISABLE_JOBS=1 bun run start
bun run dev:web
```

Open <http://localhost:5173/sign-in> and click **Dev login as
host@example.com**.

## Guardrails

- The button exists only in the Vite dev build (`import.meta.env.DEV`); it is
  not in `dist/web`.
- The server enables password sign-in only when `CALPACA_DEV_LOGIN=1` **and**
  `BETTER_AUTH_URL` is `localhost`, `127.0.0.1` or `[::1]`
  (`src/auth/dev-login.ts`). Sign-up by password is always off; only the seed
  script creates the account.
- The demo credentials (`src/core/dev-login.ts`) are not secrets. Never point
  `seed:dev` at a shared or production database.
- Google calendar sync does not work for the demo host; it has no Google
  account.

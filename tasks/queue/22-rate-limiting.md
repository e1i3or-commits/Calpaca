# Task 22: Rate limiting the public write surface

Overnight-safe.

## Goal
`POST /holds` and `POST /bookings` cannot be vacuumed by one client, and a
single event type cannot have its whole calendar locked up by active holds.
Postgres-backed; there is no Redis and there never will be.

## Spec
- Window math is pure core: `src/core/ratelimit/window.ts` — fixed-window
  bucketing (`bucketStart(now, windowSeconds)`) and the allow/deny decision
  (`decide(count, limit)` returning remaining + retryAfterSeconds), taking
  every input as a parameter. Colocated tests in
  `tests/core/ratelimit/window.test.ts` including a DST-transition instant
  (buckets are UTC math, so it must be a non-event — prove it).
- New table `rate_limits` (drizzle schema + generated migration):
  `key` text, `bucketStart` timestamptz, `count` int, primary key
  (`key`, `bucketStart`). One atomic
  `INSERT .. ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`
  per check in `src/db/rate-limit-repo.ts`; a reaper deletes buckets older
  than the widest window (piggyback on the existing hold-expiry pg-boss
  schedule, do not add a new job queue).
- Hono middleware applied to `POST /holds` and `POST /bookings` only.
  Client IP from `x-forwarded-for` first hop (the app sits behind NPM);
  fall back to the socket address. Defaults, each overridable by env at the
  API boundary: holds 20/min/IP, bookings 10/min/IP. Over limit →
  `429 { error: "rate_limited", retryAfterSeconds }`.
- Per-event-type active-holds ceiling: before creating a hold, count
  `status = 'active'` holds for the event type; at or above the ceiling
  (default 50, env-overridable) → `429 { error: "holds_exhausted" }`.
  Expired-but-unreaped holds must not count: the count query filters
  `expires_at > now()` as well as status.
- Hold-expiry reaping under load, in this task's tests (DB-backed, same
  TEST_DATABASE_URL skip-and-truncate convention as tasks 11/12): create
  ~200 short-TTL holds across event types, run `expireHolds`, assert all
  flip to expired, the ceiling opens up again, and a subsequent
  createHold succeeds.
- API tests in NEW file `tests/api/rate-limiting.test.ts`: request N+1
  exceeds the cap and gets 429 with retryAfterSeconds; distinct IPs do not
  share buckets; ceiling behavior end to end.

## Acceptance
```
bun run verify
```

## Constraints
Do not modify existing test files. No new dependencies — this is well under
the ~100-line zero-dependency threshold. GET endpoints stay unlimited.

# Invitee-added guests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the person booking a meeting add up to ten guests, who become real Google Calendar attendees, when the organizer has enabled it on that event type.

**Architecture:** All validation lives in one new pure core module. The validated list is stored once on the `bookings` row (and in the append-only `created` event), then concatenated into the three existing recipient lists — email `cc`, ICS `ATTENDEE` lines, and the Google `attendees` array. Reschedule and cancel need no new code because they already read the booking row and Google preserves attendees across a time-only patch.

**Tech Stack:** Bun, TypeScript, Hono + Zod, Drizzle ORM + drizzle-kit, PostgreSQL, React 19, Temporal API.

Accepted design: `docs/BOOKING-GUESTS.md`. Read it before starting.

## Global Constraints

- `src/core/` is pure only — no I/O, no database imports, no `fetch`, no `process.env`. Data arrives as parameters.
- Errors are typed results via `src/lib/result.ts` (`ok`, `err`, `Result<T, E>`), never thrown strings.
- Files kebab-case, exports camelCase, types PascalCase. No classes where a function will do. No default exports.
- Every `src/core/` module gets a colocated test in `tests/core/` mirroring the path.
- All date/time work uses Temporal. `moment`, `dayjs`, `date-fns` are forbidden.
- No new npm dependencies. This feature needs none.
- Comments explain why, not what. Sparse.
- **`bun` is not installed on the local workstation.** The gate runs on the deployment box (`hetzner:/opt/scheduler`) inside the `scheduler-agent:latest` image, with `TEST_DATABASE_URL` pointing at a throwaway Postgres — never at the production `ts-scheduler-db`, because `tests/db/*` issue `truncate ... restart identity cascade`. The recipe is in the Appendix.
- `docs/openapi.json` needs **no** regeneration: request bodies are emitted generically as `{ type: "object", additionalProperties: true }` (`src/api/openapi.ts:186-191`) and this feature adds no new route.
- Do not edit anything under `tasks/`, `scripts/verify.sh`, `scripts/loop.sh`, or `CLAUDE.md`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/booking/guests.ts` | **new.** Pure guest-list normalization and validation. Owns `MAX_GUESTS`. |
| `tests/core/booking/guests.test.ts` | **new.** The real coverage for the rules above. |
| `drizzle/0049_*.sql` | **generated.** Adds both columns. |
| `src/db/schema.ts` | Add `bookings.guestEmails` and `eventTypes.guestsEnabled`. |
| `src/core/booking/state.ts` | Add `guestEmails` to `CreatedPayload`. |
| `src/db/booking-repo.ts` | Whitelist `guestEmails` in `serializePayload`/`deserializeEvent`; add it to `BookingRow` and `getBookingById`. |
| `src/db/holds-repo.ts` | Accept guests in `confirmHold`, persist to the row and the `created` payload. |
| `src/db/availability-repo.ts` | Expose `guestsEnabled` on both event-type config types and their mappers. |
| `src/db/admin-repo.ts` | Expose `guestsEnabled` on the admin read/write models. |
| `src/api/routes/admin.ts` | Accept `guestsEnabled` in the event-type Zod schema. |
| `src/api/routes/availability.ts` | Include `guestsEnabled` in the public event-type response. |
| `src/api/routes/bookings.ts` | Accept `guests`, enforce the toggle, validate, pass through. |
| `src/jobs/invite-email.ts` | Append guests to `cc`, ICS attendees, and Google attendees. |
| `tests/jobs/invite-email.test.ts` | **new.** First test of `buildMail`'s recipient assembly. |
| `web/src/lib/api.ts` | Types for the new request field and both event-type shapes. |
| `web/src/pages/booking-page.tsx` | The `+ Add guests` control. |
| `web/src/pages/dashboard-page.tsx` | The organizer checkbox. |

---

### Task 1: Pure guest-list validation

**Files:**
- Create: `src/core/booking/guests.ts`
- Test: `tests/core/booking/guests.test.ts`

**Interfaces:**
- Consumes: `ok`, `err`, `Result` from `src/lib/result.ts`.
- Produces three exports, and Tasks 4, 5, and 6 depend on these exact names:
  - `MAX_GUESTS: number`
  - `GuestListError`
  - `parseGuestEmails(raw: readonly string[], inviteeEmail: string, hostEmails: readonly string[]): Result<string[], GuestListError>` — validates submitted input (Task 4).
  - `guestsToInvite(stored: readonly string[], inviteeEmail: string, hostEmails: readonly string[]): string[]` — filters an already-stored list at send time (Task 5).

> Why both: the booking route has no host email addresses in scope
> (`EventTypeHostRecord` carries `userId`, `role`, `weight`, `name`, `image` —
> no email), and fetching them would add a query to the booking hot path. The
> send path already has them from `getInviteContext`. So the route excludes only
> the invitee, and hosts are excluded at send time. This also covers a host
> added to the event type *after* the booking was made.

- [ ] **Step 1: Write the failing test**

Create `tests/core/booking/guests.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { MAX_GUESTS, parseGuestEmails } from "../../../src/core/booking/guests";

const INVITEE = "invitee@example.com";
const HOSTS = ["host@example.com"];

function parse(raw: readonly string[]) {
  return parseGuestEmails(raw, INVITEE, HOSTS);
}

describe("parseGuestEmails", () => {
  test("keeps a plain list in the order given", () => {
    const result = parse(["a@example.com", "b@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["a@example.com", "b@example.com"]);
  });

  test("trims and lowercases, so two spellings of one address collapse", () => {
    const result = parse(["  Guest@Example.COM ", "guest@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["guest@example.com"]);
  });

  // Both are already attendees. A repeat would become a duplicate Google
  // attendee on the event.
  test("drops the invitee's own address and any host address", () => {
    const result = parse(["INVITEE@example.com", "host@example.com", "real@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["real@example.com"]);
  });

  test("skips blank entries rather than failing, since the form leaves empty inputs", () => {
    const result = parse(["", "   ", "a@example.com"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["a@example.com"]);
  });

  test("an empty list is valid and yields an empty list", () => {
    const result = parse([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  test.each([
    "not-an-email",
    "no@domain",
    "two@@example.com",
    "spaces in@example.com",
    "@example.com",
    "trailing@example.com.",
  ])("rejects %s", (bad) => {
    const result = parse([bad]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_email");
      if (result.error.kind === "invalid_email") expect(result.error.value).toBe(bad);
    }
  });

  test("accepts exactly MAX_GUESTS", () => {
    const raw = Array.from({ length: MAX_GUESTS }, (_, i) => `g${i}@example.com`);
    const result = parse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(MAX_GUESTS);
  });

  test("rejects one more than MAX_GUESTS", () => {
    const raw = Array.from({ length: MAX_GUESTS + 1 }, (_, i) => `g${i}@example.com`);
    const result = parse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("too_many");
      if (result.error.kind === "too_many") expect(result.error.max).toBe(MAX_GUESTS);
    }
  });

  // The cap applies to what is actually invited, so duplicates must not
  // consume a slot.
  test("counts unique addresses against the cap, not raw entries", () => {
    const raw = [
      ...Array.from({ length: MAX_GUESTS }, (_, i) => `g${i}@example.com`),
      "g0@example.com",
    ];
    const result = parse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(MAX_GUESTS);
  });

  test("does not mutate the caller's array", () => {
    const raw = ["B@example.com", "a@example.com"];
    parse(raw);
    expect(raw).toEqual(["B@example.com", "a@example.com"]);
  });
});

describe("guestsToInvite", () => {
  test("returns a stored list unchanged when nobody else is attending it", () => {
    expect(guestsToInvite(["a@example.com"], INVITEE, HOSTS)).toEqual(["a@example.com"]);
  });

  // A host can be added to the event type after the booking was made. Sending
  // to them as a guest would duplicate them on the calendar event.
  test("drops a guest who has since become a host", () => {
    expect(guestsToInvite(
      ["later-host@example.com", "a@example.com"],
      INVITEE,
      ["host@example.com", "later-host@example.com"],
    )).toEqual(["a@example.com"]);
  });

  test("drops the invitee and compares case-insensitively", () => {
    expect(guestsToInvite(["INVITEE@example.com", "a@example.com"], INVITEE, HOSTS))
      .toEqual(["a@example.com"]);
  });

  test("an empty stored list yields an empty list", () => {
    expect(guestsToInvite([], INVITEE, HOSTS)).toEqual([]);
  });
});
```

Update the import at the top of the file to include the new export:

```ts
import { guestsToInvite, MAX_GUESTS, parseGuestEmails } from "../../../src/core/booking/guests";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/core/booking/guests.test.ts`
Expected: FAIL — cannot resolve `../../../src/core/booking/guests`.

- [ ] **Step 3: Write the implementation**

Create `src/core/booking/guests.ts`:

```ts
import { err, ok, type Result } from "../../lib/result";

/**
 * A public booking form fans out one email and one calendar invite per guest,
 * so the ceiling lives here rather than as a per-event-type column: an
 * unbounded list is a deliverability risk on the sending domain, and one
 * tested constant costs less than a column, a Zod field, a form input, and a
 * number every organizer has to decide.
 */
export const MAX_GUESTS = 10;

export type GuestListError =
  | { readonly kind: "too_many"; readonly max: number }
  | { readonly kind: "invalid_email"; readonly value: string };

// Deliberately conservative rather than RFC-complete: one @, no whitespace,
// and a dotted domain. This only keeps obvious junk out of an address handed
// to Google and to the mail transport; those two are the real validators.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Normalizes an invitee-supplied guest list into the exact addresses to invite.
 *
 * Excludes the invitee and the hosts because they are already attendees, so a
 * repeat would land twice on the Google event. Blank entries are skipped rather
 * than rejected: the booking form leaves empty inputs behind, and failing the
 * whole booking over one is hostile.
 */
export function parseGuestEmails(
  raw: readonly string[],
  inviteeEmail: string,
  hostEmails: readonly string[],
): Result<string[], GuestListError> {
  const alreadyAttending = new Set(
    [inviteeEmail, ...hostEmails].map((address) => address.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  const guests: string[] = [];

  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) return err({ kind: "invalid_email", value: entry });
    if (alreadyAttending.has(email) || seen.has(email)) continue;
    seen.add(email);
    guests.push(email);
  }

  // Counted after de-duplication so a pasted duplicate does not spend a slot.
  if (guests.length > MAX_GUESTS) return err({ kind: "too_many", max: MAX_GUESTS });
  return ok(guests);
}

/**
 * Filters an already-stored guest list at send time.
 *
 * The booking route cannot exclude hosts, because host email addresses are not
 * in its scope and fetching them would add a query to the booking hot path. The
 * send path has them, and running the check there also covers a host added to
 * the event type after the booking was made — inviting them as a guest would
 * duplicate them on the calendar event.
 */
export function guestsToInvite(
  stored: readonly string[],
  inviteeEmail: string,
  hostEmails: readonly string[],
): string[] {
  const alreadyAttending = new Set(
    [inviteeEmail, ...hostEmails].map((address) => address.trim().toLowerCase()),
  );
  return stored.filter((email) => !alreadyAttending.has(email.trim().toLowerCase()));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/core/booking/guests.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/booking/guests.ts tests/core/booking/guests.test.ts
git commit -m "feat: validate invitee-supplied guest lists in the core

Pure normalization for a list of guest addresses: trim, lowercase,
de-duplicate, drop anyone already attending, reject malformed input, and
cap the count. The cap is a tested constant rather than a per-event-type
column because an unbounded public form is a deliverability risk and the
column would cost a migration plus a decision every organizer has to make.

Counted after de-duplication so a pasted duplicate does not spend a slot."
```

---

### Task 2: Persist guests on the booking and in the event log

**Files:**
- Modify: `src/db/schema.ts` (the `bookings` table, beside `bookingAnswers`)
- Modify: `src/core/booking/state.ts` (`CreatedPayload`, around line 21)
- Modify: `src/db/booking-repo.ts` (`BookingRow` ~line 201, `getBookingById` ~line 239, `serializePayload` ~line 32, `deserializeEvent` ~line 64)
- Modify: `src/db/holds-repo.ts` (`confirmHold` signature ~line 216, insert ~line 348, `created` payload ~line 369)
- Create: `drizzle/0049_*.sql` (generated, do not hand-write)
- Test: `tests/db/holds-repo.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `confirmHold(..., guestEmails?: readonly string[])` as a new **trailing optional** parameter; `BookingRow.guestEmails?: readonly string[]`. Task 4 calls the former, Task 5 reads the latter.

- [ ] **Step 1: Add both columns to the schema**

In `src/db/schema.ts`, in the `bookings` table immediately after `bookingAnswers`:

```ts
  // Invitee-added guests. Real attendees: they go on the Google event, the ICS,
  // and the email Cc. Bounded by MAX_GUESTS in src/core/booking/guests.ts.
  guestEmails: jsonb("guest_emails").$type<string[]>().notNull().default([]),
```

And in the `eventTypes` table immediately after `emailVerificationRequired`:

```ts
  guestsEnabled: boolean("guests_enabled").notNull().default(false),
```

- [ ] **Step 2: Generate the migration**

Run: `bunx drizzle-kit generate`
Expected: a new `drizzle/0049_*.sql` containing two `ADD COLUMN` statements and nothing else. Read it and confirm — a generated `DROP` or a rewritten table means the schema edit was wrong; fix the schema and regenerate rather than editing the SQL.

- [ ] **Step 3: Extend the event payload type**

In `src/core/booking/state.ts`, add to `CreatedPayload`:

```ts
  /** invitee-added guests, already normalized by core/booking/guests */
  readonly guestEmails?: readonly string[];
```

- [ ] **Step 4: Whitelist the key in both directions**

In `src/db/booking-repo.ts`, in `serializePayload`'s `"created"` case, add as the last spread:

```ts
        ...(event.payload.guestEmails?.length ? { guestEmails: event.payload.guestEmails } : {}),
```

In `deserializeEvent`'s `"created"` case, add the matching read:

```ts
        ...(Array.isArray(p.guestEmails) ? { guestEmails: p.guestEmails as string[] } : {}),
```

> A key passed to `appendEvent` but absent from `serializePayload` is dropped with no error — `meeting` is in exactly that state today. Both directions are required.

- [ ] **Step 5: Expose it on the booking row**

In `BookingRow`, after `bookingAnswers`:

```ts
  /** Optional so BookingRow fixtures predating the column stay valid; rows
   * loaded from the database always carry it. */
  readonly guestEmails?: readonly string[];
```

In `getBookingById`'s returned object, after `bookingAnswers`:

```ts
    guestEmails: row.guestEmails,
```

- [ ] **Step 6: Accept and persist guests in confirmHold**

In `src/db/holds-repo.ts`, append one trailing optional parameter to `confirmHold` (after `proposalPublicId`, so no existing call site changes):

```ts
  guestEmails?: readonly string[],
```

In the `bookings` insert, after `bookingAnswers`:

```ts
        guestEmails: guestEmails ? [...guestEmails] : [],
```

In the `appendEvent(booking.id, "created", { ... })` payload, after `bookingAnswers`:

```ts
        ...(guestEmails?.length ? { guestEmails } : {}),
```

> `confirmHold` already takes ten positional parameters and this makes eleven,
> which is a real smell. It is still the right move here: a trailing optional
> parameter leaves every existing call site untouched, whereas converting to an
> options object would touch the booking route, the reschedule path, and every
> fixture in one unrelated change. Note it as a follow-up rather than doing it
> now. The order is `holdIds, invitee, executor, assignment, routingAnswers,
> meeting, bookingAnswers, offerPublicId, expectation, proposalPublicId,
> guestEmails` — count carefully when calling positionally, since every slot in
> the middle is optional and a misplaced argument type-checks in some cases.

- [ ] **Step 7: Write the failing test**

Append to `tests/db/holds-repo.test.ts`, inside the existing top-level `describe`. Match the file's existing fixture helpers rather than inventing new ones — read the neighbouring tests first and reuse how they create an event type, a host, and an active hold.

```ts
  test("guests persist on the booking row and survive a projection rebuild", async () => {
    const { holdId } = await seedActiveHold();  // existing helper in this file
    const confirmed = await confirmHold(
      [holdId],
      { email: "invitee@example.com", name: "Invitee", timezone: "America/New_York" },
      db,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ["a@example.com", "b@example.com"],
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    const row = await getBookingById(confirmed.value.bookingId, db);
    expect(row?.guestEmails).toEqual(["a@example.com", "b@example.com"]);

    // The log is the source of truth, so a rebuild must not lose them.
    await rebuildProjection(confirmed.value.bookingId, db);
    const rebuilt = await getBookingById(confirmed.value.bookingId, db);
    expect(rebuilt?.guestEmails).toEqual(["a@example.com", "b@example.com"]);
  });

  test("a booking with no guests stores an empty list, never null", async () => {
    const { holdId } = await seedActiveHold();
    const confirmed = await confirmHold(
      [holdId],
      { email: "invitee@example.com", name: "Invitee", timezone: "America/New_York" },
      db,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const row = await getBookingById(confirmed.value.bookingId, db);
    expect(row?.guestEmails).toEqual([]);
  });
```

Import `getBookingById` and `rebuildProjection` from `../../src/db/booking-repo` if the file does not already.

- [ ] **Step 8: Run the test**

Run (see Appendix for the container recipe): `bun test tests/db/holds-repo.test.ts`
Expected: PASS. If it SKIPs, `TEST_DATABASE_URL` is unset — these suites gate on that variable, not `DATABASE_URL`. A skip is not a pass.

- [ ] **Step 9: Full gate**

Run: `bun run verify`
Expected: PASS with zero failures and no new skips.

- [ ] **Step 10: Commit**

```bash
git add src/db/schema.ts src/core/booking/state.ts src/db/booking-repo.ts \
        src/db/holds-repo.ts drizzle/ tests/db/holds-repo.test.ts
git commit -m "feat: store invitee-added guests on the booking and in its event log

Adds bookings.guest_emails and event_types.guests_enabled, both additive
with defaults, so the migration is safe to apply ahead of the code.

guestEmails is whitelisted in serializePayload and deserializeEvent, not
only written to the row: a key passed to appendEvent but missing from the
serializer is dropped silently, which is the state \`meeting\` is in today.
The projection writer never sets the column, so guests survive both a
normal fold and a rebuildProjection repair."
```

---

### Task 3: Plumb `guestsEnabled` to the organizer and the public page

**Files:**
- Modify: `src/db/admin-repo.ts` (`AdminEventType` ~line 350, `toAdminEventType` ~line 409, `EventTypeInput` ~line 475, `updateEventType` set clause ~line 557)
- Modify: `src/api/routes/admin.ts` (`eventTypeBodySchema` ~line 299)
- Modify: `src/db/availability-repo.ts` (`EventTypeConfig` ~line 27, `BookingEventTypeConfig` ~line 171, `toBookingEventTypeConfig` ~line 197, `getEventTypeBySlug` ~line 272)
- Modify: `src/api/routes/availability.ts` (~line 350)
- Test: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: the `eventTypes.guestsEnabled` column from Task 2.
- Produces: `BookingEventTypeConfig.guestsEnabled?: boolean` (read by Task 4) and a `guestsEnabled: true` key in the public event-type response (read by Task 6).

- [ ] **Step 1: Mirror `emailVerificationRequired` at all six server sites**

Add `readonly guestsEnabled?: boolean;` beside the existing `emailVerificationRequired` declaration in each of: `AdminEventType`, `EventTypeInput` (`src/db/admin-repo.ts`), `EventTypeConfig`, and `BookingEventTypeConfig` (`src/db/availability-repo.ts`). Keep them optional for the documented fixture-compatibility reason.

Add `guestsEnabled: row.guestsEnabled,` beside the existing `emailVerificationRequired` mapping in `toAdminEventType`, `toBookingEventTypeConfig`, and `getEventTypeBySlug`.

Add `guestsEnabled: input.guestsEnabled,` to the `updateEventType` set clause. `createEventType` spreads `...input`, so it needs no edit.

- [ ] **Step 2: Accept it in the admin Zod schema**

In `src/api/routes/admin.ts`, in `eventTypeBodySchema` beside `emailVerificationRequired`:

```ts
    guestsEnabled: z.boolean().default(false),
```

- [ ] **Step 3: Publish it on the public event-type response**

In `src/api/routes/availability.ts`, beside the `emailVerificationRequired` spread:

```ts
      ...(eventType.guestsEnabled ? { guestsEnabled: true } : {}),
```

The omit-when-false pattern is deliberate and matches its neighbour.

- [ ] **Step 4: Write the failing test**

In `tests/api/admin.test.ts`, following the shape of the existing event-type create/update tests:

```ts
  test("guestsEnabled round-trips through create and update", async () => {
    const created = await createEventTypeViaApi({ ...validEventTypeBody, guestsEnabled: true });
    expect(created.status).toBe(201);
    expect((await created.json()).guestsEnabled).toBe(true);

    const updated = await updateEventTypeViaApi(
      (await created.json()).id,
      { ...validEventTypeBody, guestsEnabled: false },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).guestsEnabled).toBe(false);
  });

  test("guestsEnabled defaults to false when the field is absent", async () => {
    const created = await createEventTypeViaApi(validEventTypeBody);
    expect((await created.json()).guestsEnabled).toBe(false);
  });
```

Reuse the file's real helper and fixture names — read the surrounding tests and substitute; do not add helpers that already exist under another name.

- [ ] **Step 5: Run it**

Run: `bun test tests/api/admin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/admin-repo.ts src/api/routes/admin.ts src/db/availability-repo.ts \
        src/api/routes/availability.ts tests/api/admin.test.ts
git commit -m "feat: expose the guests toggle to organizers and booking pages

guestsEnabled follows the exact path emailVerificationRequired already
takes, including the omit-when-false shape of the public response, so the
booking page can tell whether to offer the control at all."
```

---

### Task 4: Accept and enforce guests on the booking route

**Files:**
- Modify: `src/api/routes/bookings.ts` (`bookingBodySchema` ~line 218, the confirm handler ~line 646)
- Test: `tests/api/bookings.test.ts`

**Interfaces:**
- Consumes: `parseGuestEmails`, `MAX_GUESTS` (Task 1); `confirmHold`'s trailing `guestEmails` parameter (Task 2); `BookingEventTypeConfig.guestsEnabled` (Task 3).
- Produces: two error codes — `guests_not_allowed` and `invalid_guests`, both HTTP 400. Task 6 maps them to copy.

- [ ] **Step 1: Add the request field**

In `bookingBodySchema`, after `bookingAnswers`:

```ts
  // Bounded generously here and enforced precisely by core/booking/guests, so
  // an over-long list produces a clear invalid_guests error instead of a
  // generic invalid_body.
  guests: z.array(z.string().max(320)).max(50).default([]),
```

Import at the top of the file:

```ts
import { parseGuestEmails } from "../../core/booking/guests";
```

- [ ] **Step 2: Enforce before confirming**

In the `POST /bookings` handler, after the event type is resolved and *before* `deps.confirmHold(...)` is called, so a rejection writes nothing:

```ts
    // The endpoint is public, so the toggle has to be enforced server-side or
    // it is decorative.
    if (parsed.data.guests.length > 0 && !eventType.guestsEnabled) {
      return c.json({ error: "guests_not_allowed" }, 400);
    }
    // Host addresses are not in scope here and fetching them would add a query
    // to the booking hot path, so hosts are excluded at send time instead
    // (guestsToInvite, Task 5). The invitee's own address is in the body, so
    // that exclusion happens now.
    const guests = parseGuestEmails(parsed.data.guests, parsed.data.invitee.email, []);
    if (!guests.ok) {
      return c.json({ error: "invalid_guests", detail: guests.error }, 400);
    }
```

Then pass `guests.value` as the trailing argument to `deps.confirmHold(...)`.

- [ ] **Step 3: Write the failing tests**

In `tests/api/bookings.test.ts`, add a fixture beside `verifiedEventType`:

```ts
const guestsEventType: BookingEventTypeConfig = {
  ...soloEventType,
  id: "et-guests",
  slug: "guests-30",
  guestsEnabled: true,
};
```

and register it in both `eventTypesBySlug` (`"guests-30"`) and `eventTypesById` (`"et-guests"`). Then, in the `POST /bookings` describe block:

```ts
  test("rejects guests when the event type has the toggle off", async () => {
    const res = await confirm({ eventTypeSlug: "solo-30", guests: ["g@example.com"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("guests_not_allowed");
  });

  test("rejects a malformed guest address", async () => {
    const res = await confirm({ eventTypeSlug: "guests-30", guests: ["nope"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_guests");
  });

  test("stores a normalized guest list when the toggle is on", async () => {
    const res = await confirm({
      eventTypeSlug: "guests-30",
      guests: ["  Guest@Example.com ", "guest@example.com"],
    });
    expect(res.status).toBe(201);
    expect(lastConfirmHoldCall().guestEmails).toEqual(["guest@example.com"]);
  });

  test("an absent guests field is accepted and books normally", async () => {
    const res = await confirm({ eventTypeSlug: "solo-30" });
    expect(res.status).toBe(201);
  });
```

Adapt `confirm(...)` and `lastConfirmHoldCall()` to the helpers and stub-capture style this file already uses — read the neighbouring `POST /bookings` tests and follow them exactly.

- [ ] **Step 4: Run them**

Run: `bun test tests/api/bookings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/bookings.ts tests/api/bookings.test.ts
git commit -m "feat: accept invitee-added guests when the event type allows them

Both checks run before the hold is confirmed, so a rejected list writes
nothing. The toggle is enforced on the server because /bookings is public
and a client-side-only check would be decorative.

The Zod bound is generous and the real cap lives in core, so an over-long
list returns invalid_guests rather than a generic invalid_body."
```

---

### Task 5: Invite guests — email, ICS, and Google

**Files:**
- Modify: `src/jobs/invite-email.ts` (`syncGoogleEvent` attendees ~line 187, `buildMail` ICS attendees ~line 327, `buildMail` `cc` ~line 336)
- Create: `tests/jobs/invite-email.test.ts`
- Test: `tests/core/invite/ics.test.ts`

**Interfaces:**
- Consumes: `BookingRow.guestEmails` (Task 2); `guestsToInvite` (Task 1).
- Produces: no new exports. `buildMail` keeps its current signature.

- [ ] **Step 1: Resolve the guest list once per send**

Add the import to `src/jobs/invite-email.ts`:

```ts
import { guestsToInvite } from "../core/booking/guests";
```

In `buildMail`, immediately after `const { booking, hosts } = ctx;`:

```ts
  const guests = guestsToInvite(
    booking.guestEmails ?? [],
    booking.inviteeEmail,
    hosts.map((h) => h.email),
  );
```

Add the identical three lines in `syncGoogleEvent`, which destructures its own `booking` and `hosts` from the context.

- [ ] **Step 2: Add guests to the email Cc**

In `buildMail`, replace the `cc` line:

```ts
    cc: [...hosts.map((h) => h.email), ...guests],
```

- [ ] **Step 3: Add guests to the ICS attendees**

In the `buildIcs({ ... })` call, extend `attendees`:

```ts
        attendees: [
          { name: booking.inviteeName, email: booking.inviteeEmail },
          ...hosts.slice(1).map((h) => ({ name: h.name, email: h.email })),
          // A guest supplies only an address, and IcsPerson.name is
          // interpolated straight into CN=, so an empty string would emit a
          // bare "CN=;". The address is what clients show anyway.
          ...guests.map((email) => ({ name: email, email })),
        ],
```

- [ ] **Step 4: Add guests to the Google attendees**

In `syncGoogleEvent`'s `insertEvent` call, extend `attendees`:

```ts
        attendees: [
          { email: booking.inviteeEmail, displayName: booking.inviteeName },
          ...hosts.slice(1).map((h) => ({ email: h.email, displayName: h.name })),
          ...guests.map((email) => ({ email })),
        ],
```

`sendUpdates=all` is already set in `src/sync/google.ts`, so Google mails each guest its native invitation. No change there.

- [ ] **Step 4: Write the failing ICS test**

In `tests/core/invite/ics.test.ts`, inside the `buildIcs` describe:

```ts
  test("emits one ATTENDEE line per guest, with the address as the common name", () => {
    const ics = buildIcs({
      ...base,
      attendees: [
        ...base.attendees,
        { name: "g1@example.com", email: "g1@example.com" },
        { name: "g2@example.com", email: "g2@example.com" },
      ],
    });
    expect(ics.match(/^ATTENDEE/gm)).toHaveLength(3);
    expect(ics).toContain("ATTENDEE;CN=g1@example.com;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:g1@example.com\r\n");
    // never a bare CN
    expect(ics).not.toContain("CN=;");
  });
```

- [ ] **Step 5: Write the failing recipient-assembly test**

Create `tests/jobs/invite-email.test.ts`. Nothing currently asserts how `buildMail` assembles recipients, which is exactly what this task changes, so build a minimal `InviteContext` literal rather than touching the database:

```ts
import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { buildMail } from "../../src/jobs/invite-email";
import type { InviteContext } from "../../src/db/booking-repo";

const NOW = Temporal.Instant.from("2026-07-28T12:00:00Z");

function context(guestEmails: string[] = []): InviteContext {
  return {
    booking: {
      id: "b1",
      eventTypeId: "et1",
      startsAt: Temporal.Instant.from("2026-07-30T13:30:00Z"),
      endsAt: Temporal.Instant.from("2026-07-30T14:00:00Z"),
      inviteeEmail: "invitee@example.com",
      inviteeName: "Invitee",
      inviteeTimezone: "America/New_York",
      hostUserIds: ["u1", "u2"],
      status: "confirmed",
      rescheduleToken: "r",
      cancelToken: "c",
      bookingAnswers: {},
      guestEmails,
    },
    eventTypeTitle: "Intro call",
    eventTypeSlug: "intro",
    hosts: [
      { id: "u1", name: "Organizer", email: "organizer@example.com", timezone: "America/New_York" },
      { id: "u2", name: "Second Host", email: "second@example.com", timezone: "America/New_York" },
    ],
    rescheduleCount: 0,
  } as InviteContext;
}

describe("buildMail recipients", () => {
  test("without guests, Cc is exactly the hosts", () => {
    const mail = buildMail(context(), "created", NOW);
    expect(mail.to).toBe("invitee@example.com");
    expect(mail.cc).toEqual(["organizer@example.com", "second@example.com"]);
  });

  // The organizer is Cc'd but a plain reply must still reach a human rather
  // than the unattended EMAIL_FROM address.
  test("Reply-To stays the organizer regardless of guests", () => {
    expect(buildMail(context(["g@example.com"]), "created", NOW).replyTo)
      .toBe("organizer@example.com");
  });

  test("guests are appended to Cc after the hosts", () => {
    const mail = buildMail(context(["g1@example.com", "g2@example.com"]), "created", NOW);
    expect(mail.cc).toEqual([
      "organizer@example.com",
      "second@example.com",
      "g1@example.com",
      "g2@example.com",
    ]);
  });

  test("the invitee is never moved out of To by adding guests", () => {
    expect(buildMail(context(["g1@example.com"]), "created", NOW).to)
      .toBe("invitee@example.com");
  });

  test("guests appear as ICS attendees on the fallback path", () => {
    const mail = buildMail(context(["g1@example.com"]), "created", NOW, { includeIcs: true });
    expect(mail.ics?.content).toContain("mailto:g1@example.com");
  });

  test("cancellations reach guests too, so nobody keeps a dead hold", () => {
    const mail = buildMail(context(["g1@example.com"]), "cancelled", NOW);
    expect(mail.cc).toContain("g1@example.com");
    expect(mail.ics?.method).toBe("CANCEL");
  });

  // The design claims reschedule and cancel need no new code. These two assert
  // that claim rather than trusting it.
  test("reschedules reach guests", () => {
    expect(buildMail(context(["g1@example.com"]), "rescheduled", NOW).cc)
      .toContain("g1@example.com");
  });

  test("reminders reach guests", () => {
    expect(buildMail(context(["g1@example.com"]), "reminder", NOW).cc)
      .toContain("g1@example.com");
  });

  // A host added to the event type after the booking would otherwise be
  // invited twice: once as a host, once as the guest they were booked as.
  test("a guest who is also a host is not Cc'd twice", () => {
    const mail = buildMail(context(["second@example.com", "g1@example.com"]), "created", NOW);
    expect(mail.cc).toEqual([
      "organizer@example.com",
      "second@example.com",
      "g1@example.com",
    ]);
  });
});
```

If `"reminder"` is not a member of `InviteKind`, drop that one test rather than widening the type.

If `InviteContext` is not exported from `src/db/booking-repo.ts`, export the type (type-only, no runtime change) rather than duplicating it in the test.

- [ ] **Step 6: Run both test files**

Run: `bun test tests/jobs/invite-email.test.ts tests/core/invite/ics.test.ts`
Expected: PASS.

- [ ] **Step 7: Settle the open question from the spec**

`docs/BOOKING-GUESTS.md` leaves one thing unresolved: whether a recipient our
validation accepts but the provider rejects at SMTP time fails the **whole**
message rather than that one recipient. If it does, a single bad guest address
would cost the invitee their confirmation email — which the design forbids.

Check `src/notifications/mailer.ts` and the SES configuration, then either:

- record in `docs/BOOKING-GUESTS.md` that per-recipient failure is confirmed and
  the invitee is unaffected; or
- send the invitee's copy in its own `sendMail` call, with guests in a second
  message, and note why.

Do not skip this step. Do not guess the answer.

- [ ] **Step 8: Full gate**

Run: `bun run verify`
Expected: PASS, zero failures, no new skips.

- [ ] **Step 9: Commit**

```bash
git add src/jobs/invite-email.ts tests/jobs/invite-email.test.ts tests/core/invite/ics.test.ts \
        docs/BOOKING-GUESTS.md
git commit -m "feat: invite guests on the calendar event, the ICS, and the email

Guests join the three existing recipient lists. sendUpdates=all was
already set on every Google write, so each guest gets Google's native
invitation with RSVP.

Reschedule and cancel need no code: patchEventTime sends only start and
end so Google keeps the attendee list, and both mails read the booking
row. First test of buildMail's recipient assembly, which had none."
```

---

### Task 6: The two pieces of UI

**Files:**
- Modify: `web/src/lib/api.ts` (`EventTypeMeta` ~line 157, `AdminEventType` ~line 879, `confirmBooking` args ~line 559)
- Modify: `web/src/pages/dashboard-page.tsx` (`DEFAULT_EVENT_TYPE` ~line 2670, `eventTypeToInput` ~line 2713, `EVENT_TYPE_SECTION_FOR_FIELD` ~line 3083, the Invitee form disclosure ~line 3814)
- Modify: `web/src/pages/booking-page.tsx` (error map ~line 60, `DetailsStep` props ~line 763/780, state ~line 796, the field ~line 920, `completeBooking` ~line 829, parent render ~line 459)

**Interfaces:**
- Consumes: `guestsEnabled` on both event-type shapes (Task 3); the `guests` request field and its two error codes (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Extend the client types**

In `web/src/lib/api.ts`: add `guestsEnabled?: boolean;` to `EventTypeMeta` beside `emailVerificationRequired`, add the same to `AdminEventType` (`EventTypeInput` derives from it via `Omit`, so it needs no edit), and add `guests?: string[];` to the `confirmBooking` argument type.

- [ ] **Step 2: Add the organizer checkbox**

In `web/src/pages/dashboard-page.tsx`: add `guestsEnabled: false,` to `DEFAULT_EVENT_TYPE`; add `guestsEnabled: eventType.guestsEnabled ?? false,` to `eventTypeToInput`; add `guestsEnabled: "invitee",` to `EVENT_TYPE_SECTION_FOR_FIELD`; and add a checkbox inside the Invitee form disclosure, immediately after the email-verification one, copying that label's exact markup:

```tsx
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={form.guestsEnabled ?? false}
              onChange={(event) => set("guestsEnabled", event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Let invitees add guests</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Guests are invited to the calendar event and copied on every email. Up to ten per booking.
              </span>
            </span>
          </label>
```

- [ ] **Step 3: Add the booking-form control**

In `web/src/pages/booking-page.tsx`:

Add to the error-code copy map:

```ts
  guests_not_allowed: "This event type does not accept extra guests.",
  invalid_guests: "Check the guest email addresses and try again.",
```

Pass the flag down where `emailVerificationRequired` is passed (~line 459):

```tsx
          guestsEnabled={meta?.guestsEnabled ?? false}
```

Declare it in `DetailsStep`'s destructure and its type (`guestsEnabled: boolean;`). Add state beside `bookingAnswers`:

```tsx
  // One empty input is revealed on open; blank entries are ignored server-side.
  const [guests, setGuests] = useState<string[]>([]);
```

Render after the Email field, before Location:

```tsx
        {guestsEnabled && (
          <div className="flex flex-col gap-1.5">
            {guests.length === 0 ? (
              <button
                type="button"
                className="self-start text-sm font-medium text-primary underline"
                onClick={() => setGuests([""])}
              >
                + Add guests
              </button>
            ) : (
              <>
                <Label htmlFor="guest-0">Guests</Label>
                {guests.map((guest, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      id={`guest-${index}`}
                      type="email"
                      placeholder="colleague@example.com"
                      value={guest}
                      onChange={(e) => setGuests(guests.map((g, i) => (i === index ? e.target.value : g)))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGuests(guests.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {guests.length < MAX_GUESTS && (
                  <button
                    type="button"
                    className="self-start text-sm font-medium text-primary underline"
                    onClick={() => setGuests([...guests, ""])}
                  >
                    + Add another
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  Guests get the calendar invite and every email about this meeting.
                  {guests.length >= MAX_GUESTS - 2 ? ` ${MAX_GUESTS - guests.length} left.` : ""}
                </p>
              </>
            )}
          </div>
        )}
```

Import `MAX_GUESTS` from the core module, matching the existing precedent for importing core into the web bundle:

```ts
import { MAX_GUESTS } from "../../../src/core/booking/guests";
```

Send them in `completeBooking`, alongside `bookingAnswers`:

```tsx
        ...(guests.some((g) => g.trim()) ? { guests } : {}),
```

- [ ] **Step 4: Typecheck both projects**

Run: `bun run typecheck`
Expected: clean. This runs `tsc --noEmit && tsc -p web --noEmit` — the root project excludes `web/`, so a web-only error appears **only** in the second half. Do not stop at the first.

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 6: Full gate**

Run: `bun run verify`
Expected: PASS.

- [ ] **Step 7: Verify by hand**

Build and run the app. On an event type with the toggle **off**, the booking form shows no guest control at all. Turn it on in the dashboard, reload the public page, add two guests, and book. Confirm: the booking row has both addresses, the confirmation email Cc's them, and — if Google is connected — the calendar event lists them as attendees.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/api.ts web/src/pages/dashboard-page.tsx web/src/pages/booking-page.tsx
git commit -m "feat: let invitees add guests on booking pages that allow it

A collapsed '+ Add guests' control appears only when the organizer has
enabled it, expanding to a capped list of email inputs. The cap is
imported from the core module so the form and the server cannot disagree
about it. Client validation is a courtesy; the server revalidates."
```

---

## Appendix: running the gate

`bun` is not installed on the workstation. Run tests on the deployment box, against a throwaway database — **never** the production `ts-scheduler-db`, because `tests/db/*` truncate tables.

```bash
# 1. get the work onto the box
git format-patch -N --stdout <base>..HEAD > /tmp/guests.patch
scp /tmp/guests.patch hetzner:/tmp/guests.patch
ssh hetzner "cd /opt/scheduler && git am /tmp/guests.patch"

# 2. throwaway Postgres
ssh hetzner "docker run -d --rm --name gate-db \
  -e POSTGRES_PASSWORD=gate -e POSTGRES_USER=gate -e POSTGRES_DB=gate postgres:16-alpine"

# 3. the gate. TEST_DATABASE_URL, not DATABASE_URL — the db suites gate on it
#    and silently SKIP without it.
ssh hetzner "docker run --rm --network container:gate-db -v /opt/scheduler:/w -w /w \
  -e TEST_DATABASE_URL=postgres://gate:gate@127.0.0.1:5432/gate \
  scheduler-agent:latest bash -lc 'bun run verify'"

# 4. tear down
ssh hetzner "docker stop gate-db"
```

A run reporting `0 fail` alongside dozens of `(skip)` lines from `tests/db/` is **not** a passing gate. The current baseline is 592 pass / 0 fail / 1806 assertions; the finished feature should exceed that and skip nothing new.

## Deployment note

Migration `0049` is additive with defaults on both columns, so it can be applied before the code that reads it and needs no backfill. Leave `guests_enabled` **false on every existing event type**, including Quick Meeting — turning it on is an organizer decision, not a side effect of shipping.

# Event Type Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace group its event types into named, collapsible folders in the dashboard, so a list of 20+ stays scannable.

**Architecture:** A new `event_type_folders` table plus a nullable `folder_id` on `event_types`. Folders are workspace-scoped and flat; an event type with no folder renders in an implicit "Ungrouped" section. CRUD mirrors the existing schedules routes in `src/api/routes/admin.ts`. Grouping happens client-side from the folder list plus each event type's `folderId`; the server only guarantees a deterministic order.

**Tech Stack:** Bun, TypeScript, Hono + Zod, Drizzle ORM on PostgreSQL, React 19, Tailwind v4 + shadcn/ui.

**Spec:** `docs/EVENT-TYPE-FOLDERS.md`

## Global Constraints

- **Bun is not installed on this box.** `bun run verify` and `bun test` cannot run locally. Use `node_modules/.bin/tsc --noEmit && node_modules/.bin/tsc -p web --noEmit` for typecheck and `node_modules/.bin/eslint .` for lint. Bun test suites run on the scheduler box or in the agent container; when a step says "run the test", run it there, or state plainly in the commit that it was not executed locally.
- Postgres is the only infrastructure dependency. **No new npm dependencies in this plan** — none are needed.
- `src/core/` is pure functions only. Nothing in this plan belongs there; folders are persistence plus UI.
- Files kebab-case, exports camelCase, types PascalCase. No default exports. No classes where a function will do.
- All date/time math uses Temporal. Not relevant to this plan — folders carry no times beyond `created_at`.
- DB tests live under `tests/db/` and must be wrapped in `describe.skipIf(!process.env.TEST_DATABASE_URL)`. API tests live under `tests/api/` and use injected fake deps, never a real database.
- Do not edit `scripts/verify.sh`, `scripts/loop.sh`, `CLAUDE.md`, or anything under `tasks/`.
- Work on a branch, not `main`. Suggested: `feat/event-type-folders`.

## File Structure

**Tasks 1–2 (refactor, no behavior change):**

- Create `web/src/lib/error-text.ts` — `ERROR_TEXT` map and `errorText()`. Used 60× in `dashboard-page.tsx` and needed by the extracted tab; a shared module avoids a circular import.
- Create `web/src/lib/format.ts` — `slugify()`. Used by both the event type cluster and code that stays behind.
- Create `web/src/components/dashboard-primitives.tsx` — `InlineLoading`, `ActionableEmptyState`, `CopyFeedbackLabel`.
- Create `web/src/components/event-types-tab.tsx` — the event type cluster: `DEFAULT_EVENT_TYPE`, `eventTypeToInput`, `EventTypesTab`, `EventTypeSection`, `EVENT_TYPE_SECTION_FOR_FIELD`, `EventTypeDisclosure`, `EventTypeForm`.
- Modify `web/src/pages/dashboard-page.tsx` — drops ~1,050 lines (5,944 → ~4,900), gains imports.

**Tasks 3–5 (backend):**

- Modify `src/db/schema.ts` — `eventTypeFolders` table, `folderId` column on `eventTypes`.
- Create `drizzle/0051_*.sql` — generated, then hand-edited for the case-insensitive unique index.
- Modify `src/db/admin-repo.ts` — folder CRUD, `setEventTypeFolder`, `folderId` on `AdminEventType`, deterministic ordering.
- Modify `src/api/routes/admin.ts` — `AdminDeps` entries, Zod schema, five routes.
- Create `tests/db/event-type-folders.test.ts`, `tests/api/event-type-folders.test.ts`.

**Tasks 6–8 (frontend):**

- Modify `web/src/lib/api.ts` — folder bindings.
- Modify `web/src/components/event-types-tab.tsx` — sections, folder management, assignment.

---

### Task 1: Extract shared helpers out of dashboard-page.tsx

Pure move, no behavior change. This exists so Task 2's extraction does not create a circular import between `dashboard-page.tsx` and `event-types-tab.tsx`.

**Files:**
- Create: `web/src/lib/error-text.ts`
- Create: `web/src/lib/format.ts`
- Create: `web/src/components/dashboard-primitives.tsx`
- Modify: `web/src/pages/dashboard-page.tsx` (remove the moved declarations, add imports)

**Interfaces:**
- Consumes: nothing.
- Produces: `errorText(e: unknown): string`, `ERROR_TEXT: Record<string, string>`, `slugify(title: string): string`, and three components — `InlineLoading({ label: string })`, `ActionableEmptyState({ title, description, action })`, `CopyFeedbackLabel({ copied, idle })`. Task 2 imports all of these.

- [ ] **Step 1: Create the error-text module**

Move `ERROR_TEXT` (`dashboard-page.tsx:196-207`) and `errorText` (`209-212`) verbatim into a new file:

```ts
// web/src/lib/error-text.ts
import { ApiError } from "@/lib/api";

export const ERROR_TEXT: Record<string, string> = {
  slug_taken: "That slug is already taken.",
  schedule_in_use: "Event types still use this schedule.",
  cannot_forward_to_self: "Choose another person for forwarding.",
  write_destination_required: "Choose another booking destination before disconnecting this calendar.",
  calendar_not_writable: "Google does not allow this account to create events on that calendar.",
  event_type_in_use: "This event type has bookings; it can't be deleted.",
  invalid_body: "Some fields are invalid. Check the form.",
  team_not_found: "Team not found.",
  last_team_admin: "Promote another member before removing or demoting the final team admin.",
  form_not_found: "Routing form not found.",
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? `Error: ${e.code}`;
  return "Could not reach the server.";
}
```

Delete both declarations from `dashboard-page.tsx` and add `import { errorText } from "@/lib/error-text";` to its import block.

- [ ] **Step 2: Create the format module**

Move `slugify` (`dashboard-page.tsx:2675-2680`) verbatim into `web/src/lib/format.ts` with an `export` keyword. Delete it from `dashboard-page.tsx` and add `import { slugify } from "@/lib/format";`.

Do **not** move `durationLabel` — both of its call sites (`1825`, `2050`) stay in `dashboard-page.tsx`.

- [ ] **Step 3: Create the dashboard primitives module**

Move `InlineLoading` (`684-690`), `ActionableEmptyState` (`692-...`), and `CopyFeedbackLabel` (`1422-...`) verbatim into `web/src/components/dashboard-primitives.tsx`, adding `export` to each. Carry over whatever `@/components/ui/*` imports they use. Delete them from `dashboard-page.tsx` and import them back:

```ts
import {
  ActionableEmptyState,
  CopyFeedbackLabel,
  InlineLoading,
} from "@/components/dashboard-primitives";
```

- [ ] **Step 4: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/tsc -p web --noEmit && node_modules/.bin/eslint .`
Expected: clean. Any error here means a declaration was moved but a reference was missed — fix the import rather than duplicating the declaration.

- [ ] **Step 5: Confirm it is genuinely a pure move**

Run: `git diff --stat`
Expected: `dashboard-page.tsx` shows roughly equal insertions and deletions minus the moved lines, and the three new files contain them. Read the `dashboard-page.tsx` diff and confirm every removed line is either a moved declaration or a replaced import. If any line of logic changed, revert it.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/error-text.ts web/src/lib/format.ts \
  web/src/components/dashboard-primitives.tsx web/src/pages/dashboard-page.tsx
git commit -m "refactor: extract shared dashboard helpers into their own modules

Pure move ahead of the event types tab extraction. errorText, slugify,
and the three list primitives are needed by both dashboard-page and the
tab, so they move to shared modules to avoid a circular import."
```

---

### Task 2: Extract the event types tab

Pure move, no behavior change. Isolates the feature's surface so Task 6–8 diffs are readable.

**Files:**
- Create: `web/src/components/event-types-tab.tsx`
- Modify: `web/src/pages/dashboard-page.tsx` (remove the cluster at `2650-2718`, `2720-3062`, `3073-3124`, `3336-3985`; add one import)

**Interfaces:**
- Consumes: `errorText`, `slugify`, `InlineLoading`, `ActionableEmptyState`, `CopyFeedbackLabel` from Task 1.
- Produces: `EventTypesTab({ users, initialEditor, onEdit, onCloseEditor })` — the same props it has today. Tasks 6–8 modify this file only.

- [ ] **Step 1: Move the cluster**

Create `web/src/components/event-types-tab.tsx` and move these declarations into it verbatim, in this order:

| Declaration | Current lines |
| --- | --- |
| `DEFAULT_EVENT_TYPE` | 2650–2674 |
| `eventTypeToInput` | 2682–2718 |
| `EventTypesTab` | 2720–3062 |
| `EventTypeSection` (type) | 3073 |
| `EVENT_TYPE_SECTION_FOR_FIELD` | 3075–3091 |
| `EventTypeDisclosure` | 3093–3124 |
| `EventTypeForm` | 3336–3985 |

Export only `EventTypesTab`. The rest stay module-private.

Do **not** move `BookingPagesManager` (3126–3334) or `DEFAULT_BOOKING_PAGE` (3064–3071) — they sit between the moved blocks but belong to a different feature.

- [ ] **Step 2: Fix up imports in both files**

The new file needs, at minimum, React hooks (`useCallback`, `useEffect`, `useRef`, `useState`), the `@/lib/api` bindings the cluster calls (`listEventTypes`, `createEventType`, `updateEventType`, `deleteEventType`, `listSchedules`, `listTeams`, `listPresentationOptions`, `getWorkspace`, `ApiError`, and the types `AdminEventType`, `EventTypeInput`, `DirectoryUser`, `Schedule`, `Team`, `PresentationOption`), `themeOptions` from `@/lib/theme`, the lucide icons the JSX uses, the `@/components/ui/*` components, and the Task 1 modules.

Let the compiler drive this: add `import { EventTypesTab } from "@/components/event-types-tab";` to `dashboard-page.tsx`, then run typecheck and resolve each reported symbol. Remove any import in `dashboard-page.tsx` that is now unused — `eslint` will flag them.

- [ ] **Step 3: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/tsc -p web --noEmit && node_modules/.bin/eslint .`
Expected: clean.

- [ ] **Step 4: Verify the render is unchanged**

Build the web app and load the event types tab:

Run: `node_modules/.bin/vite build -c web/vite.config.ts`
Expected: build succeeds.

Then confirm `dashboard-page.tsx` still renders `<EventTypesTab` at its original call site (~line 394) with the same four props, and that the file is now roughly 4,900 lines (`wc -l web/src/pages/dashboard-page.tsx`).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/event-types-tab.tsx web/src/pages/dashboard-page.tsx
git commit -m "refactor: move the event types tab into its own component

Pure move, no behavior change. dashboard-page.tsx drops from 5,944 to
~4,900 lines and folder support lands on a file that fits in one read."
```

---

### Task 3: Schema and migration

**Files:**
- Modify: `src/db/schema.ts:322-373` (the `eventTypes` table) and insert the new table just above it
- Create: `drizzle/0051_*.sql` (generated)
- Test: `tests/db/event-type-folders.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `eventTypeFolders` table export with columns `id`, `workspaceId`, `name`, `position`, `createdAt`; `eventTypes.folderId` (`uuid | null`). Task 4 imports both.

- [ ] **Step 1: Write the failing schema test**

The `withDb` helper defined here is reused by Task 4 — keep it exported from the
module scope of this file.

```ts
// tests/db/event-type-folders.test.ts
import { describe, expect, test } from "bun:test";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";

type TestDb = NodePgDatabase<typeof schema>;

/** Fresh pool, migrated schema, empty tables. Always closes the pool. */
async function withDb(run: (db: TestDb) => Promise<void>): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`
      truncate table ${schema.eventTypeFolders}, ${schema.eventTypes},
        ${schema.workspaces}, ${schema.users}
      restart identity cascade
    `);
    await run(db);
  } finally {
    await pool.end();
  }
}

const acmeWorkspace = { name: "Acme", slug: "acme" };
const otherWorkspace = { name: "Other", slug: "other" };
const ownerUser = { name: "Owner", email: "owner@example.test" };

describe.skipIf(!process.env.TEST_DATABASE_URL)("event type folders schema", () => {
  test("deleting a folder un-groups its event types instead of deleting them", async () => {
    await withDb(async (db) => {
      const [workspace] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const [owner] = await db.insert(schema.users).values(ownerUser).returning();
      const [folder] = await db.insert(schema.eventTypeFolders)
        .values({ workspaceId: workspace!.id, name: "Franchise", position: 0 }).returning();
      const [eventType] = await db.insert(schema.eventTypes).values({
        workspaceId: workspace!.id,
        ownerUserId: owner!.id,
        folderId: folder!.id,
        slug: "kickoff",
        title: "Kickoff",
        durationMinutes: 45,
      }).returning();

      await db.delete(schema.eventTypeFolders).where(eq(schema.eventTypeFolders.id, folder!.id));

      const [survivor] = await db.select().from(schema.eventTypes)
        .where(eq(schema.eventTypes.id, eventType!.id));
      expect(survivor).toBeDefined();
      expect(survivor!.folderId).toBeNull();
    });
  });

  test("folder names collide case-insensitively within a workspace but not across them", async () => {
    await withDb(async (db) => {
      const [acme] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const [other] = await db.insert(schema.workspaces).values(otherWorkspace).returning();

      await db.insert(schema.eventTypeFolders)
        .values({ workspaceId: acme!.id, name: "Franchise", position: 0 });

      await expect(
        db.insert(schema.eventTypeFolders)
          .values({ workspaceId: acme!.id, name: "franchise", position: 1 }),
      ).rejects.toThrow();

      const [elsewhere] = await db.insert(schema.eventTypeFolders)
        .values({ workspaceId: other!.id, name: "Franchise", position: 0 }).returning();
      expect(elsewhere).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `TEST_DATABASE_URL=<url> bun test tests/db/event-type-folders.test.ts`
Expected: FAIL — `schema.eventTypeFolders` is undefined.

If no `TEST_DATABASE_URL` is available the suite skips and reports zero failures. A skip is **not** a pass; note it and confirm on the box where the database exists.

- [ ] **Step 3: Add the table and column**

Insert immediately above `export const eventTypes` (`src/db/schema.ts:322`):

```ts
// Dashboard-only grouping for the event type list. Flat, workspace-scoped;
// deleting a folder un-groups its event types and deletes none of them.
export const eventTypeFolders = pgTable("event_type_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("event_type_folder_workspace_name_uq")
    .on(t.workspaceId, sql`lower(${t.name})`),
]);
```

Add to the `eventTypes` column list, after `teamId` (`src/db/schema.ts:327`):

```ts
  folderId: uuid("folder_id").references(() => eventTypeFolders.id, { onDelete: "set null" }),
```

And to the `eventTypes` index array (`src/db/schema.ts:370-373`):

```ts
  index("event_type_folder_idx").on(t.workspaceId, t.folderId),
```

- [ ] **Step 4: Generate the migration**

Run: `bunx drizzle-kit generate`
Expected: a new `drizzle/0051_*.sql`.

Open it and confirm the unique index is on `lower(name)`, not on `name`. Drizzle's SQL emitter sometimes drops the expression. If it emitted `("workspace_id","name")`, hand-edit it to:

```sql
CREATE UNIQUE INDEX "event_type_folder_workspace_name_uq"
  ON "event_type_folders" ("workspace_id", lower("name"));
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `TEST_DATABASE_URL=<url> bun test tests/db/event-type-folders.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/ tests/db/event-type-folders.test.ts
git commit -m "feat: add event_type_folders table and folder_id on event types

Workspace-scoped, flat grouping. ON DELETE SET NULL so removing a folder
never removes bookable event types. Unique on lower(name) so Franchise
and franchise cannot both exist."
```

---

### Task 4: Repository functions and deterministic ordering

**Files:**
- Modify: `src/db/admin-repo.ts` — `AdminEventType` (`329`), `listEventTypesForUser` (`418-433`), `EventTypeInput` (`457`), plus new folder functions
- Test: `tests/db/event-type-folders.test.ts` (extend)

**Interfaces:**
- Consumes: `eventTypeFolders`, `eventTypes.folderId` from Task 3.
- Produces, all used by Task 5:
  - `interface EventTypeFolderRecord { readonly id: string; readonly name: string; readonly position: number }`
  - `listEventTypeFolders(workspaceId: string, executor?: Db): Promise<EventTypeFolderRecord[]>`
  - `createEventTypeFolder(workspaceId: string, name: string, executor?: Db): Promise<EventTypeFolderRecord | "name_taken">`
  - `updateEventTypeFolder(id: string, workspaceId: string, patch: { name?: string; position?: number }, executor?: Db): Promise<EventTypeFolderRecord | null | "name_taken">`
  - `deleteEventTypeFolder(id: string, workspaceId: string, executor?: Db): Promise<"deleted" | "not_found">`
  - `setEventTypeFolder(eventTypeId: string, userId: string, folderId: string | null, executor?: Db, workspaceId?: string): Promise<AdminEventType | null | "folder_not_found">` — note `executor` sits before `workspaceId`, matching `listEventTypesForUser` and `getEventTypeForAdmin`
  - `AdminEventType` gains `readonly folderId: string | null`.

- [ ] **Step 1: Write the failing repo test**

Append this whole block to `tests/db/event-type-folders.test.ts`:

```ts
describe.skipIf(!process.env.TEST_DATABASE_URL)("event type folder repo", () => {
  test("lists folders in position order and rejects a duplicate name", async () => {
    await withDb(async (db) => {
      const [acme] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();

      const support = await createEventTypeFolder(acme!.id, "Support", db);
      const franchise = await createEventTypeFolder(acme!.id, "Franchise", db);
      expect(typeof support).toBe("object");
      expect((support as EventTypeFolderRecord).position).toBe(0);
      expect((franchise as EventTypeFolderRecord).position).toBe(1);

      expect(await createEventTypeFolder(acme!.id, "franchise", db)).toBe("name_taken");

      const listed = await listEventTypeFolders(acme!.id, db);
      expect(listed.map((folder) => folder.name)).toEqual(["Support", "Franchise"]);
    });
  });

  test("event types come back in a deterministic title order", async () => {
    await withDb(async (db) => {
      const [acme] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const [owner] = await db.insert(schema.users).values(ownerUser).returning();
      await db.insert(schema.eventTypes).values([
        { workspaceId: acme!.id, ownerUserId: owner!.id, slug: "zeta", title: "Zeta", durationMinutes: 15 },
        { workspaceId: acme!.id, ownerUserId: owner!.id, slug: "alpha", title: "Alpha", durationMinutes: 15 },
        { workspaceId: acme!.id, ownerUserId: owner!.id, slug: "mid", title: "Mid", durationMinutes: 15 },
      ]);

      const rows = await listEventTypesForUser(owner!.id, db, acme!.id);
      expect(rows.map((row) => row.title)).toEqual(["Alpha", "Mid", "Zeta"]);
    });
  });

  test("setEventTypeFolder refuses a folder from another workspace", async () => {
    await withDb(async (db) => {
      const [acme] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const [other] = await db.insert(schema.workspaces).values(otherWorkspace).returning();
      const [owner] = await db.insert(schema.users).values(ownerUser).returning();
      const [eventType] = await db.insert(schema.eventTypes).values({
        workspaceId: acme!.id,
        ownerUserId: owner!.id,
        slug: "kickoff",
        title: "Kickoff",
        durationMinutes: 45,
      }).returning();
      const foreign = await createEventTypeFolder(other!.id, "Franchise", db);

      expect(
        await setEventTypeFolder(
          eventType!.id,
          owner!.id,
          (foreign as EventTypeFolderRecord).id,
          db,
          acme!.id,
        ),
      ).toBe("folder_not_found");

      const [unchanged] = await db.select().from(schema.eventTypes)
        .where(eq(schema.eventTypes.id, eventType!.id));
      expect(unchanged!.folderId).toBeNull();
    });
  });

  test("renaming and repositioning a folder round trips", async () => {
    await withDb(async (db) => {
      const [acme] = await db.insert(schema.workspaces).values(acmeWorkspace).returning();
      const created = await createEventTypeFolder(acme!.id, "Suport", db);
      const id = (created as EventTypeFolderRecord).id;

      const renamed = await updateEventTypeFolder(id, acme!.id, { name: "Support" }, db);
      expect((renamed as EventTypeFolderRecord).name).toBe("Support");

      const moved = await updateEventTypeFolder(id, acme!.id, { position: 5 }, db);
      expect((moved as EventTypeFolderRecord).position).toBe(5);

      expect(await deleteEventTypeFolder(id, acme!.id, db)).toBe("deleted");
      expect(await deleteEventTypeFolder(id, acme!.id, db)).toBe("not_found");
    });
  });
});
```

Add the imports these need to the top of the file:

```ts
import {
  createEventTypeFolder,
  deleteEventTypeFolder,
  listEventTypeFolders,
  listEventTypesForUser,
  setEventTypeFolder,
  updateEventTypeFolder,
  type EventTypeFolderRecord,
} from "../../src/db/admin-repo";
```

- [ ] **Step 2: Run to confirm failure**

Run: `TEST_DATABASE_URL=<url> bun test tests/db/event-type-folders.test.ts`
Expected: FAIL — the imported functions do not exist.

- [ ] **Step 3: Add `folderId` to the event type type and projection**

In `AdminEventType` (`src/db/admin-repo.ts:329`), after `teamId`:

```ts
  readonly folderId: string | null;
```

Add the same field to `EventTypeInput` (`457`) as `readonly folderId?: string | null`, and map it in `toAdminEventType` alongside `teamId`. Find `toAdminEventType` and add `folderId: row.folderId,` to its returned object. Make sure `createEventType` and `updateEventType` write `folderId: input.folderId ?? null` into their `values`/`set` objects.

- [ ] **Step 4: Add the deterministic order**

In `listEventTypesForUser` (`418-433`), append an order clause to the query:

```ts
  const rows = await executor
    .select()
    .from(eventTypes)
    .where(workspaceId ? and(eq(eventTypes.workspaceId, workspaceId), ownership) : ownership)
    .orderBy(asc(eventTypes.title));
```

Add `asc` to the `drizzle-orm` import at the top of the file.

- [ ] **Step 5: Add the folder functions**

Place these after `listEventTypesForUser`:

```ts
export interface EventTypeFolderRecord {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

export async function listEventTypeFolders(
  workspaceId: string,
  executor: Db = getDb(),
): Promise<EventTypeFolderRecord[]> {
  return executor
    .select({
      id: eventTypeFolders.id,
      name: eventTypeFolders.name,
      position: eventTypeFolders.position,
    })
    .from(eventTypeFolders)
    .where(eq(eventTypeFolders.workspaceId, workspaceId))
    .orderBy(asc(eventTypeFolders.position));
}

export async function createEventTypeFolder(
  workspaceId: string,
  name: string,
  executor: Db = getDb(),
): Promise<EventTypeFolderRecord | "name_taken"> {
  return executor.transaction(async (tx) => {
    const existing = await tx.select({ id: eventTypeFolders.id })
      .from(eventTypeFolders)
      .where(and(
        eq(eventTypeFolders.workspaceId, workspaceId),
        sql`lower(${eventTypeFolders.name}) = lower(${name})`,
      ));
    if (existing.length > 0) return "name_taken";
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${eventTypeFolders.position}) + 1, 0)` })
      .from(eventTypeFolders)
      .where(eq(eventTypeFolders.workspaceId, workspaceId));
    const [row] = await tx.insert(eventTypeFolders)
      .values({ workspaceId, name, position: next ?? 0 })
      .returning({
        id: eventTypeFolders.id,
        name: eventTypeFolders.name,
        position: eventTypeFolders.position,
      });
    return row!;
  });
}

export async function updateEventTypeFolder(
  id: string,
  workspaceId: string,
  patch: { name?: string; position?: number },
  executor: Db = getDb(),
): Promise<EventTypeFolderRecord | null | "name_taken"> {
  return executor.transaction(async (tx) => {
    if (patch.name !== undefined) {
      const clash = await tx.select({ id: eventTypeFolders.id })
        .from(eventTypeFolders)
        .where(and(
          eq(eventTypeFolders.workspaceId, workspaceId),
          sql`lower(${eventTypeFolders.name}) = lower(${patch.name})`,
          ne(eventTypeFolders.id, id),
        ));
      if (clash.length > 0) return "name_taken";
    }
    const [row] = await tx.update(eventTypeFolders)
      .set(patch)
      .where(and(eq(eventTypeFolders.id, id), eq(eventTypeFolders.workspaceId, workspaceId)))
      .returning({
        id: eventTypeFolders.id,
        name: eventTypeFolders.name,
        position: eventTypeFolders.position,
      });
    return row ?? null;
  });
}

export async function deleteEventTypeFolder(
  id: string,
  workspaceId: string,
  executor: Db = getDb(),
): Promise<"deleted" | "not_found"> {
  // event_types.folder_id is ON DELETE SET NULL: the event types survive.
  const rows = await executor.delete(eventTypeFolders)
    .where(and(eq(eventTypeFolders.id, id), eq(eventTypeFolders.workspaceId, workspaceId)))
    .returning({ id: eventTypeFolders.id });
  return rows.length > 0 ? "deleted" : "not_found";
}

export async function setEventTypeFolder(
  eventTypeId: string,
  userId: string,
  folderId: string | null,
  executor: Db = getDb(),
  workspaceId?: string,
): Promise<AdminEventType | null | "folder_not_found"> {
  const current = await getEventTypeForAdmin(eventTypeId, userId, executor, workspaceId);
  if (!current) return null;
  if (folderId !== null) {
    const [folder] = await executor.select({ id: eventTypeFolders.id })
      .from(eventTypeFolders)
      .where(and(
        eq(eventTypeFolders.id, folderId),
        ...(workspaceId ? [eq(eventTypeFolders.workspaceId, workspaceId)] : []),
      ));
    if (!folder) return "folder_not_found";
  }
  await executor.update(eventTypes)
    .set({ folderId })
    .where(eq(eventTypes.id, eventTypeId));
  return { ...current, folderId };
}
```

Add `eventTypeFolders` to the `src/db/schema` import and `asc`, `ne`, `sql` to the `drizzle-orm` import as needed.

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `TEST_DATABASE_URL=<url> bun test tests/db/event-type-folders.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Typecheck, lint, and run the rest of the suite**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint .`
Then: `bun test`
Expected: clean. Adding a required `folderId` to `AdminEventType` will break any test fixture that builds one — for example `tests/api/admin.test.ts:22` and `tests/api/theming.test.ts`. Add `folderId: null` to those literals. **Do not weaken or delete any assertion to make this pass.**

- [ ] **Step 8: Commit**

```bash
git add src/db/admin-repo.ts tests/db/event-type-folders.test.ts tests/api/
git commit -m "feat: folder repo functions and a deterministic event type order

listEventTypesForUser had no ORDER BY, so the dashboard list came back in
Postgres heap order and could reshuffle after any update. It now orders
by title."
```

---

### Task 5: API routes

**Files:**
- Modify: `src/api/routes/admin.ts` — `AdminDeps` (`62-148`), `defaultDeps` (`150+`), the auth path list (`~397-406`), `eventTypeBodySchema` (`266`), and a new route block after the event type routes (`~718`)
- Test: `tests/api/event-type-folders.test.ts`

**Interfaces:**
- Consumes: everything Task 4 produced.
- Produces: five HTTP routes consumed by Task 6.

- [ ] **Step 1: Write the failing route test**

```ts
// tests/api/event-type-folders.test.ts
import { describe, expect, test } from "bun:test";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import type { AdminEventType, EventTypeFolderRecord } from "../../src/db/admin-repo";

const U1 = "11111111-1111-4111-8111-111111111111";
const WS = "77777777-7777-4777-8777-777777777777";
const ET_ID = "66666666-6666-4666-8666-666666666666";
const FOLDER_ID = "88888888-8888-4888-8888-888888888888";
const FOREIGN_FOLDER = "99999999-9999-4999-8999-999999999999";

const folder: EventTypeFolderRecord = { id: FOLDER_ID, name: "Franchise", position: 0 };

const eventType: AdminEventType = {
  id: ET_ID,
  ownerUserId: U1,
  teamId: null,
  folderId: null,
  slug: "intro-call",
  title: "Intro call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  hosts: [],
};

function makeDeps(overrides: Partial<AdminDeps> = {}): AdminDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: U1, email: "host@example.test", name: "Host", workspaceId: WS });
      await next();
    },
    listUsers: async () => [],
    listSchedulesForUser: async () => [],
    createSchedule: async () => { throw new Error("unused"); },
    updateSchedule: async () => null,
    deleteSchedule: async () => "not_found",
    listTeamsForUser: async () => [],
    createTeam: async () => "slug_taken",
    isTeamMember: async () => false,
    isTeamAdmin: async () => false,
    isAppAdmin: async () => false,
    listTeamMembers: async () => [],
    addTeamMember: async () => undefined,
    removeTeamMember: async () => "not_found",
    updateTeamMemberAdmin: async () => "not_found",
    listEventTypesForUser: async () => [eventType],
    getEventTypeForAdmin: async (id) => (id === ET_ID ? eventType : null),
    createEventType: async () => "slug_taken",
    updateEventType: async () => null,
    deleteEventType: async () => "not_found",
    listEventTypeFolders: async () => [folder],
    createEventTypeFolder: async (_ws, name) =>
      name.toLowerCase() === "franchise" ? "name_taken" : { id: FOLDER_ID, name, position: 1 },
    updateEventTypeFolder: async (id, _ws, patch) =>
      id === FOLDER_ID ? { ...folder, ...patch } : null,
    deleteEventTypeFolder: async (id) => (id === FOLDER_ID ? "deleted" : "not_found"),
    setEventTypeFolder: async (id, _userId, folderId) => {
      if (id !== ET_ID) return null;
      if (folderId === FOREIGN_FOLDER) return "folder_not_found";
      return { ...eventType, folderId };
    },
    ...overrides,
  };
}

describe("event type folders", () => {
  test("lists folders in position order", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders: [folder] });
  });

  test("creates a folder", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Support" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: FOLDER_ID, name: "Support", position: 1 });
  });

  test("rejects a case-insensitive duplicate name", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "franchise" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "folder_name_taken" });
  });

  test("rejects a blank name", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });

  test("renames a folder and 404s an unknown one", async () => {
    const router = createAdminRoutes(makeDeps());
    const ok = await router.request(`/api/me/event-type-folders/${FOLDER_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Franchising" }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).name).toBe("Franchising");

    const missing = await router.request(`/api/me/event-type-folders/${FOREIGN_FOLDER}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "folder_not_found" });
  });

  test("deletes a folder", async () => {
    const res = await createAdminRoutes(makeDeps())
      .request(`/api/me/event-type-folders/${FOLDER_ID}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("moves an event type into a folder and back to ungrouped", async () => {
    const router = createAdminRoutes(makeDeps());
    const into = await router.request(`/api/me/event-types/${ET_ID}/folder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: FOLDER_ID }),
    });
    expect(into.status).toBe(200);
    expect((await into.json()).folderId).toBe(FOLDER_ID);

    const out = await router.request(`/api/me/event-types/${ET_ID}/folder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: null }),
    });
    expect(out.status).toBe(200);
    expect((await out.json()).folderId).toBeNull();
  });

  test("refuses a folder from another workspace", async () => {
    const res = await createAdminRoutes(makeDeps())
      .request(`/api/me/event-types/${ET_ID}/folder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: FOREIGN_FOLDER }),
      });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
  });

  test("returns an empty list when the session has no workspace", async () => {
    const deps = makeDeps({
      requireAuth: async (c, next) => {
        c.set("user", { id: U1, email: "host@example.test", name: "Host" });
        await next();
      },
    });
    const res = await createAdminRoutes(deps).request("/api/me/event-type-folders");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders: [] });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test tests/api/event-type-folders.test.ts`
Expected: FAIL — the deps do not exist on `AdminDeps` and the routes 404.

- [ ] **Step 3: Extend `AdminDeps` and `defaultDeps`**

Add to the `AdminDeps` interface, after `deleteEventType` (`src/api/routes/admin.ts:118`):

```ts
  readonly listEventTypeFolders: (workspaceId: string) => Promise<EventTypeFolderRecord[]>;
  readonly createEventTypeFolder: (
    workspaceId: string,
    name: string,
  ) => Promise<EventTypeFolderRecord | "name_taken">;
  readonly updateEventTypeFolder: (
    id: string,
    workspaceId: string,
    patch: { name?: string; position?: number },
  ) => Promise<EventTypeFolderRecord | null | "name_taken">;
  readonly deleteEventTypeFolder: (
    id: string,
    workspaceId: string,
  ) => Promise<"deleted" | "not_found">;
  readonly setEventTypeFolder: (
    eventTypeId: string,
    userId: string,
    folderId: string | null,
    workspaceId?: string,
  ) => Promise<AdminEventType | null | "folder_not_found">;
```

These are **required**, not optional — every route in this task depends on them, and the codebase reserves `?` for genuinely optional surfaces like booking pages.

Add the matching `defaultDeps` entries, importing the Task 4 functions:

```ts
  listEventTypeFolders: (workspaceId) => listEventTypeFolders(workspaceId),
  createEventTypeFolder: (workspaceId, name) => createEventTypeFolder(workspaceId, name),
  updateEventTypeFolder: (id, workspaceId, patch) =>
    updateEventTypeFolder(id, workspaceId, patch),
  deleteEventTypeFolder: (id, workspaceId) => deleteEventTypeFolder(id, workspaceId),
  setEventTypeFolder: (eventTypeId, userId, folderId, workspaceId) =>
    setEventTypeFolder(eventTypeId, userId, folderId, undefined, workspaceId),
```

- [ ] **Step 4: Register the auth path**

Add `"/api/me/event-type-folders"` to the path array at `src/api/routes/admin.ts:397-403`. Without it the new routes are unauthenticated. `/api/me/event-types/:id/folder` is already covered by the existing `"/api/me/event-types"` entry and its `/*` wildcard.

- [ ] **Step 5: Add the Zod schemas and `folderId` on the event type body**

Near `eventTypeBodySchema` (`266`):

```ts
const folderBodySchema = z.object({ name: z.string().trim().min(1).max(60) });
const folderPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  position: z.number().int().min(0).max(999).optional(),
});
const eventTypeFolderAssignSchema = z.object({
  folderId: z.string().uuid().nullable(),
});
```

Add to `eventTypeBodySchema`, next to `teamId` (`280`):

```ts
    folderId: z.string().uuid().nullable().default(null),
```

- [ ] **Step 6: Add the routes**

Insert after the `DELETE /api/me/event-types/:id` handler (`~718`):

```ts
  // ---- event type folders ----

  router.get("/api/me/event-type-folders", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    return c.json({
      folders: workspaceId ? await deps.listEventTypeFolders(workspaceId) : [],
    });
  });

  router.post("/api/me/event-type-folders", async (c) => {
    const parsed = folderBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.createEventTypeFolder(workspaceId, parsed.data.name);
    if (result === "name_taken") return c.json({ error: "folder_name_taken" }, 409);
    return c.json(result, 201);
  });

  router.put("/api/me/event-type-folders/:id", async (c) => {
    const parsed = folderPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.updateEventTypeFolder(c.req.param("id"), workspaceId, parsed.data);
    if (result === "name_taken") return c.json({ error: "folder_name_taken" }, 409);
    if (!result) return c.json({ error: "folder_not_found" }, 404);
    return c.json(result);
  });

  router.delete("/api/me/event-type-folders/:id", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.deleteEventTypeFolder(c.req.param("id"), workspaceId);
    if (result === "not_found") return c.json({ error: "folder_not_found" }, 404);
    return c.json({ ok: true });
  });

  // Narrow endpoint on purpose: the list row's "Move to" must not have to
  // rebuild a whole event type body from the list projection.
  router.patch("/api/me/event-types/:id/folder", async (c) => {
    const parsed = eventTypeFolderAssignSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    const result = await deps.setEventTypeFolder(
      c.req.param("id"),
      user.id,
      parsed.data.folderId,
      user.workspaceId,
    );
    if (result === "folder_not_found") return c.json({ error: "folder_not_found" }, 404);
    if (!result) return c.json({ error: "event_type_not_found" }, 404);
    return c.json(result);
  });
```

- [ ] **Step 7: Guard `folderId` on the event type create and update routes**

`eventTypeBodySchema` now carries a `folderId`, and nothing yet checks it belongs
to the caller's workspace. Without this a crafted request files an event type
into another workspace's folder. Add this helper above the route definitions:

```ts
  const folderIsInWorkspace = async (
    folderId: string | null,
    workspaceId?: string,
  ): Promise<boolean> => {
    if (folderId === null) return true;
    if (!workspaceId) return false;
    const folders = await deps.listEventTypeFolders(workspaceId);
    return folders.some((folder) => folder.id === folderId);
  };
```

Then in both `POST /api/me/event-types` and `PUT /api/me/event-types/:id`, after
the existing `teamId` membership check and before the repo call:

```ts
    if (!(await folderIsInWorkspace(parsed.data.folderId, user.workspaceId))) {
      return c.json({ error: "folder_not_found" }, 404);
    }
```

Add the matching test to `tests/api/event-type-folders.test.ts`:

```ts
  test("creating an event type in another workspace's folder is refused", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "intro-call",
        title: "Intro call",
        durationMinutes: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 10,
        minimumNoticeMin: 240,
        rollingWindowDays: 14,
        mode: "solo",
        scheduleId: null,
        teamId: null,
        folderId: FOREIGN_FOLDER,
        hosts: [],
      }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
  });
```

`makeDeps` returns only `FOLDER_ID` from `listEventTypeFolders`, so `FOREIGN_FOLDER`
is correctly absent.

- [ ] **Step 8: Run the tests to confirm they pass**

Run: `bun test tests/api/event-type-folders.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 9: Fix the other suites and regenerate the OpenAPI doc**

Adding required `AdminDeps` members breaks every existing `makeDeps` factory. Add the five new entries to each — `tests/api/admin.test.ts:110`, `tests/api/theming.test.ts`, and any other file typecheck flags. Give them minimal stubs (`async () => []`, `async () => null`, `async () => "not_found"`).

Run: `bun run openapi:generate`
Then: `bun test && node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint .`
Expected: all green. `tests/api/openapi.test.ts` exists and may assert the spec matches the routes.

- [ ] **Step 10: Commit**

```bash
git add src/api/routes/admin.ts tests/api/ docs/
git commit -m "feat: CRUD routes for event type folders

Five routes mirroring the schedules block, plus folderId on the event
type body. PATCH /api/me/event-types/:id/folder is deliberately narrow so
the list row's Move to control cannot clobber unrelated fields."
```

---

### Task 6: Client API bindings and folder-grouped rendering

**Files:**
- Modify: `web/src/lib/api.ts` (near `listEventTypes`, `983`)
- Modify: `web/src/components/event-types-tab.tsx`
- Modify: `web/src/lib/error-text.ts`

**Interfaces:**
- Consumes: the Task 5 routes.
- Produces: `EventTypeFolder` type and five client functions; a folder-grouped list. Tasks 7–8 build on the same file.

- [ ] **Step 1: Add the client bindings**

In `web/src/lib/api.ts`, following the shape of the existing `listEventTypes`:

```ts
export interface EventTypeFolder {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

export function listEventTypeFolders(): Promise<{ folders: EventTypeFolder[] }> {
  return request("/api/me/event-type-folders");
}

export function createEventTypeFolder(name: string): Promise<EventTypeFolder> {
  return request("/api/me/event-type-folders", { method: "POST", body: { name } });
}

export function updateEventTypeFolder(
  id: string,
  patch: { name?: string; position?: number },
): Promise<EventTypeFolder> {
  return request(`/api/me/event-type-folders/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patch,
  });
}

export function deleteEventTypeFolder(id: string): Promise<{ ok: true }> {
  return request(`/api/me/event-type-folders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setEventTypeFolder(
  eventTypeId: string,
  folderId: string | null,
): Promise<AdminEventType> {
  return request(`/api/me/event-types/${encodeURIComponent(eventTypeId)}/folder`, {
    method: "PATCH",
    body: { folderId },
  });
}
```

Match the existing helper's exact signature — read `listEventTypes` at `web/src/lib/api.ts:983` and the `request`/`ApiError` helper above it, and mirror how other mutations pass method and body. Add `folderId: string | null` to the `AdminEventType` interface and `folderId?: string | null` to `EventTypeInput` in the same file.

- [ ] **Step 2: Add the new error copy**

In `web/src/lib/error-text.ts`, add two entries to `ERROR_TEXT`:

```ts
  folder_name_taken: "A folder with that name already exists.",
  folder_not_found: "Folder not found.",
```

- [ ] **Step 3: Load folders alongside event types**

In `EventTypesTab`, add state and fold the fetch into the existing `useEffect` that calls `reload()`:

```ts
const [folders, setFolders] = useState<EventTypeFolder[]>([]);

const reloadFolders = useCallback(() => {
  listEventTypeFolders()
    .then((r) => setFolders(r.folders))
    .catch(() => undefined);
}, []);
```

Call `reloadFolders()` in the same `useEffect` that already calls `reload()` and `listSchedules()`, and add `reloadFolders` to its dependency array.

Folder fetch failure degrades to a flat list rather than an error state — the same `.catch(() => undefined)` posture the sibling fetches in that effect already use.

- [ ] **Step 4: Add collapse state**

```ts
const [collapsed, setCollapsed] = useState<Set<string>>(() => {
  try {
    const raw = localStorage.getItem("calpaca:et-folders-collapsed");
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
});

const toggleFolder = useCallback((folderId: string) => {
  setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    localStorage.setItem("calpaca:et-folders-collapsed", JSON.stringify([...next]));
    return next;
  });
}, []);
```

- [ ] **Step 5: Group the list**

Extract the existing `<li>` body (`dashboard-page.tsx:2961-3010` before the move) into a local `EventTypeRow` component in the same file so it can be rendered from two places without duplication. Its props: `{ eventType: AdminEventType; copied: string | null; onCopyLink: () => void; onToggleEmbed: () => void; onEdit: () => void; onRemove: () => void }`. Keep the markup byte-identical to what is there now.

Define a single callback that builds a row, so the flat and grouped branches
cannot drift apart:

```tsx
const renderRow = useCallback((et: AdminEventType) => (
  <EventTypeRow
    key={et.id}
    eventType={et}
    copied={copied}
    onCopyLink={() => copyLink(et.slug)}
    onToggleEmbed={() =>
      setEmbed(embed?.slug === et.slug ? null : { slug: et.slug, mode: "inline" })}
    onEdit={() => onEdit(et.id)}
    onRemove={() => void remove(et.id)}
  />
), [copied, embed, onEdit]);
```

Then replace the flat `<ul>` with:

```tsx
{folders.length === 0 ? (
  <ul className="flex flex-col gap-2">
    {eventTypes.map(renderRow)}
  </ul>
) : (
  <div className="flex flex-col gap-4">
    {folders.map((folder) => (
      <FolderSection
        key={folder.id}
        folder={folder}
        eventTypes={eventTypes.filter((et) => et.folderId === folder.id)}
        collapsed={collapsed.has(folder.id)}
        onToggle={() => toggleFolder(folder.id)}
        renderRow={renderRow}
      />
    ))}
    {eventTypes.some((et) => !et.folderId) && (
      <FolderSection
        folder={null}
        eventTypes={eventTypes.filter((et) => !et.folderId)}
        collapsed={collapsed.has("ungrouped")}
        onToggle={() => toggleFolder("ungrouped")}
        renderRow={renderRow}
      />
    )}
  </div>
)}
```

`FolderSection`'s props are therefore `{ folder: EventTypeFolder | null; eventTypes: AdminEventType[]; collapsed: boolean; onToggle: () => void; renderRow: (et: AdminEventType) => ReactNode }`. Task 7 adds folder-management props to it.

`FolderSection` renders a `<button>` disclosure header — chevron, `folder?.name ?? "Ungrouped"`, and the event type count — followed by the rows when not collapsed. Give the button `aria-expanded={!collapsed}` and `aria-controls` pointing at the list's id. A `folder` of `null` means Ungrouped: no `⋯` menu, ever.

**The zero-folder branch must render exactly today's markup.** A workspace that never makes a folder should see no visual change at all.

- [ ] **Step 6: Verify in the browser**

Build and load the dashboard against a workspace with a couple of folders and at least one ungrouped event type.

Run: `node_modules/.bin/vite build -c web/vite.config.ts`

Then confirm by eye: folders appear in position order, Ungrouped is last, clicking a header collapses that section, and the state survives a page reload. Also confirm a workspace with zero folders renders the flat list unchanged.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/api.ts web/src/lib/error-text.ts web/src/components/event-types-tab.tsx
git commit -m "feat: render event types grouped into collapsible folders

Zero folders renders exactly the previous flat list; grouping only
appears once a workspace creates one."
```

---

### Task 7: Folder management

**Files:**
- Modify: `web/src/components/event-types-tab.tsx`

**Interfaces:**
- Consumes: `createEventTypeFolder`, `updateEventTypeFolder`, `deleteEventTypeFolder` from Task 6; `FolderSection` from Task 6.
- Produces: the create/rename/reorder/delete controls. Task 8 reuses `reloadFolders` and the `folders` state.

- [ ] **Step 1: Add the "New folder" button**

In the `CardHeader` action cluster, before the existing "New" button:

```tsx
<Button size="sm" variant="outline" onClick={() => setCreatingFolder(true)}>
  <FolderPlus className="mr-1 h-4 w-4" /> New folder
</Button>
```

Add `const [creatingFolder, setCreatingFolder] = useState(false);` and import `FolderPlus` from `lucide-react`. When `creatingFolder` is true, render an inline text input above the list with Save and Cancel; Save calls `createEventTypeFolder(name)`, then `reloadFolders()`, then clears the flag. On `ApiError`, set the existing `error` state via `errorText(e)` and leave the input open so the name can be corrected.

- [ ] **Step 2: Add the folder header menu**

Give `FolderSection` a `⋯` trigger (lucide `MoreHorizontal`) rendered only when `folder !== null`, opening the same dropdown primitive the codebase already uses elsewhere in this file. Four items:

- **Rename** — swaps the header label for an inline input seeded with the current name; Enter or Save calls `updateEventTypeFolder(folder.id, { name })` then `reloadFolders()`.
- **Move up** — disabled on the first folder. Swaps `position` with the previous folder via two `updateEventTypeFolder` calls, then `reloadFolders()`.
- **Move down** — disabled on the last folder. Same, with the next folder.
- **Delete** — see Step 3.

Implement the swap in the parent, where the full `folders` array is in scope:

```ts
const moveFolder = useCallback(async (folderId: string, direction: -1 | 1) => {
  const index = folders.findIndex((f) => f.id === folderId);
  const swapWith = folders[index + direction];
  const current = folders[index];
  if (!swapWith || !current) return;
  try {
    await updateEventTypeFolder(current.id, { position: swapWith.position });
    await updateEventTypeFolder(swapWith.id, { position: current.position });
    reloadFolders();
  } catch (e) {
    setError(errorText(e));
  }
}, [folders, reloadFolders]);
```

- [ ] **Step 3: Add delete with confirmation**

Deleting a non-empty folder must confirm first, and the confirmation must say the event types survive:

```tsx
`Delete "${folder.name}"? Its ${count} event ${count === 1 ? "type" : "types"} will move to Ungrouped, not be deleted.`
```

An empty folder deletes without a prompt. On success call both `reloadFolders()` and `reload()` — the event types' `folderId` values changed server-side and the list must re-read them.

Use whatever confirmation primitive this file already uses for `deleteEventType`; if that path uses a bare `window.confirm`, match it rather than introducing a dialog component.

- [ ] **Step 4: Typecheck, lint, build**

Run: `node_modules/.bin/tsc -p web --noEmit && node_modules/.bin/eslint . && node_modules/.bin/vite build -c web/vite.config.ts`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

Walk the whole loop by hand: create a folder; rename it; create a second; move one up and confirm the order persists across a reload; delete a folder holding at least one event type and confirm the event type reappears under Ungrouped rather than vanishing; try to create a folder whose name differs only in case from an existing one and confirm the inline error reads "A folder with that name already exists."

That last check is the one that matters most — it exercises the `lower(name)` index end to end.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/event-types-tab.tsx
git commit -m "feat: create, rename, reorder, and delete event type folders

Deleting a folder confirms and says plainly that its event types move to
Ungrouped rather than being deleted."
```

---

### Task 8: Assign event types to folders

**Files:**
- Modify: `web/src/components/event-types-tab.tsx`

**Interfaces:**
- Consumes: `setEventTypeFolder` from Task 6; `folders` state from Task 6; `EventTypeRow` from Task 6.
- Produces: nothing downstream — this is the last task.

- [ ] **Step 1: Add the row's "Move to" control**

In `EventTypeRow`'s action cluster, between Embed and the edit pencil, add a dropdown trigger labelled "Move to" (lucide `FolderInput`). Its items are every folder plus "Ungrouped", with a check against the row's current `folderId`. Selecting one calls:

```ts
const moveEventType = useCallback(async (eventTypeId: string, folderId: string | null) => {
  try {
    await setEventTypeFolder(eventTypeId, folderId);
    reload();
  } catch (e) {
    setError(errorText(e));
  }
}, [reload]);
```

Pass `folders`, the current `folderId`, and `onMove` down as props rather than reaching for context. Concretely: add `folders={folders}` and `onMove={(folderId) => void moveEventType(et.id, folderId)}` to the `<EventTypeRow>` call inside Task 6's `renderRow` callback, add `folders` and `moveEventType` to that callback's dependency array, and widen `EventTypeRow`'s prop type to match. Both the flat and grouped branches pick the control up for free, since both go through `renderRow`.

When `folders.length === 0`, render a single "New folder…" item that opens the same inline creation input as Task 7, so the control is never an empty menu.

- [ ] **Step 2: Add the editor's folder select**

In `EventTypeForm`, in the section that already holds the team select, add:

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="et-folder">Folder</Label>
  <select
    id="et-folder"
    className="block h-9 rounded-md border border-border bg-card px-3 text-sm"
    value={form.folderId ?? ""}
    onChange={(event) => onChange({ ...form, folderId: event.target.value || null })}
  >
    <option value="">Ungrouped</option>
    {folders.map((folder) => (
      <option key={folder.id} value={folder.id}>{folder.name}</option>
    ))}
  </select>
  <p className="text-xs text-muted-foreground">
    Organizes your dashboard list. Invitees never see folders.
  </p>
</div>
```

Thread `folders` into `EventTypeForm` as a new prop from `EventTypesTab`. Add `folderId` to `DEFAULT_EVENT_TYPE` as `null` and to `eventTypeToInput` as `folderId: eventType.folderId`.

The helper text is load-bearing: without it a user reasonably assumes folders show up on the booking page.

Note the select does not offer "New folder…" — the header button and the row menu both cover creation, and a third creation path inside the form would need its own error handling for a name collision mid-edit.

- [ ] **Step 3: Typecheck, lint, build**

Run: `node_modules/.bin/tsc -p web --noEmit && node_modules/.bin/eslint . && node_modules/.bin/vite build -c web/vite.config.ts`
Expected: clean.

- [ ] **Step 4: Verify the whole feature end to end**

Against a real workspace: file three event types into two folders using the row menu; confirm each jumps to the right section immediately. Open one in the editor, change its folder via the select, save, and confirm the list agrees. Reload and confirm everything persisted. Finally, confirm the public booking page for one of those event types is completely unchanged — folders must not leak to invitees.

- [ ] **Step 5: Run the full gate**

Run: `bun run verify` (on the box that has Bun)
Expected: typecheck, lint, and the whole test suite green.

If Bun is unavailable, run `node_modules/.bin/tsc --noEmit && node_modules/.bin/tsc -p web --noEmit && node_modules/.bin/eslint .` locally and say explicitly in the commit message that the Bun test suite was not run locally.

- [ ] **Step 6: Update the spec's status line**

Change the second line of `docs/EVENT-TYPE-FOLDERS.md` from `Status: approved, not yet built.` to `Status: built.` If anything shipped differently from the spec, correct the spec to match what was actually built.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/event-types-tab.tsx docs/EVENT-TYPE-FOLDERS.md
git commit -m "feat: assign event types to folders from the row menu and editor

Completes event type folders. The editor's helper text states outright
that folders are dashboard-only, since the natural assumption is that
they show up on the booking page."
```

---

## Notes for the reviewer

- **Tasks 1 and 2 must contain no behavior change.** If a review of either diff finds a changed conditional, renamed prop, or "while I was in there" fix, reject it. The whole point of paying for two refactor commits is that the folder diffs after them are small enough to actually read.
- **The ordering fix in Task 4 is a real bug fix** riding along with the feature, called out in the spec. It has its own test.
- **Nothing in this plan touches `src/core/`.** If an implementer proposes putting folder logic there, that is a misread — folders are persistence and UI, with no pure scheduling math.

# Event type folders

Design spec. Status: built.

A workspace accumulates event types faster than it retires them. Past roughly a
dozen, the dashboard list stops being scannable — you read every row to find the
one you want. Folders partition that list into named, collapsible sections.

Scope is deliberately narrow: **this is dashboard organization only.** Folders
do not appear on public booking pages, do not affect booking page composition
(`booking_pages.eventTypeIds` already does that job), and are not visible to
invitees anywhere.

## Model

Every event type lives in exactly one folder, or in none. Folders do not nest.
An event type with no folder renders in an implicit "Ungrouped" section — that
bucket is a rendering concept, not a row in the database.

Folders are workspace-scoped, matching teams and booking pages. Two users in one
workspace see the same folders.

### Schema

```
event_type_folders
  id            uuid pk default random
  workspace_id  uuid not null → workspaces.id  on delete cascade
  name          text not null
  position      integer not null
  created_at    timestamptz not null default now()

  unique index (workspace_id, lower(name))
```

```
event_types
  + folder_id  uuid null → event_type_folders.id  on delete set null
  + index (workspace_id, folder_id)
```

Three decisions worth stating outright:

- **`on delete set null`, never cascade.** Deleting a folder un-groups its event
  types. Deleting a container must never delete bookable things that have live
  links and booking history behind them.
- **Uniqueness on `lower(name)`.** Without it "Franchise" and "franchise" become
  two folders, which is the exact failure mode that makes free-text grouping rot.
- **`position` is explicit.** Folder order is the operator's, not the
  alphabet's — "Sales" belongs above "Archive" regardless of spelling.

## Ordering

`listEventTypesForUser` (`src/db/admin-repo.ts:427`) currently has no `ORDER BY`.
The list is returned in Postgres heap order, which is arbitrary and can shift
after any `UPDATE`. This is a live bug independent of folders and gets fixed
here: the query orders by `title`.

Rendering order is folder `position` ascending, then Ungrouped last. Within a
folder, event types are alphabetical by title. There is no manual within-folder
ordering.

## API

Mirrors the schedules CRUD block at `src/api/routes/admin.ts:542`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/me/event-type-folders` | `{ folders: [{ id, name, position }] }`, position order |
| `POST` | `/api/me/event-type-folders` | `{ name }` → 201. `position` = current max + 1 |
| `PUT` | `/api/me/event-type-folders/:id` | `{ name?, position? }` |
| `DELETE` | `/api/me/event-type-folders/:id` | Un-groups its event types, returns `{ ok: true }` |
| `PATCH` | `/api/me/event-types/:id/folder` | `{ folderId: uuid \| null }` |

`name` is `z.string().trim().min(1).max(60)`. "Move up" and "Move down" swap
`position` with the adjacent folder via two `PUT`s; positions stay a dense
sequence and no reindexing pass is needed.

`folderId` (`z.string().uuid().nullable().default(null)`) also joins
`eventTypeBodySchema` at `src/api/routes/admin.ts:266`, so the event type editor
saves a folder alongside everything else.

The dedicated `PATCH .../folder` endpoint exists so the list row's "Move to"
menu does not have to re-`PUT` a whole event type body reconstructed from the
list projection. That reconstruction would silently drop any field the
projection does not carry.

New error codes:

- `folder_name_taken` — 409, on create or rename collision within the workspace
- `folder_not_found` — 404

Both need entries in the dashboard's `ERROR_TEXT` map
(`web/src/pages/dashboard-page.tsx:196`).

Assigning a `folderId` belonging to another workspace returns `folder_not_found`,
not a foreign key error.

## UI

### Refactor first

`web/src/pages/dashboard-page.tsx` is 5,944 lines. The event types card moves to
`web/src/components/event-types-tab.tsx` as a pure lift-and-shift with no
behavior change, following the existing `engagements-tab.tsx` and
`proposals-panel.tsx` precedent. Folders land on top of the extracted file.

Two commits: the move, then the feature. A folder diff tangled into a 5,900-line
file is not reviewable.

### The list

Each folder renders as a section: a disclosure header with chevron, name, and
event type count, followed by its rows. Ungrouped comes last and only when
non-empty.

```
▾ Franchise                                    3   ⋯
    New Franchisee & Transfer Kickoff  /franchise-kickoff · 45 min · round robin
    Franchise Success Call             /franchise-success-call · 30 min · round robin
    Franchise Agreement, Territory & Renewal   ...

▸ Support                                      4   ⋯

▾ Ungrouped                                    2
    Quick Meeting                      /quick-meeting · 15/30/45/60 min · solo
```

The folder header's `⋯` menu holds Rename, Move up, Move down, Delete. Ungrouped
has no menu — it is not a folder and cannot be renamed, reordered, or deleted.

Deleting a non-empty folder confirms first, and the confirmation says the event
types will move to Ungrouped rather than be deleted.

Collapse state persists in `localStorage` under `calpaca:et-folders-collapsed`
as a JSON array of folder ids, following the existing `calpaca:sidebar-collapsed`
convention. It is a UI preference, not server state.

### Zero folders is the default and stays comfortable

When a workspace has no folders the list renders exactly as it does today: flat,
no section headers, no Ungrouped label, no empty state prompting anyone to
organize. The only change is a "New folder" button beside "New". Filing is
opt-in; a workspace with four event types should never pay for this feature.

### Assigning a folder

Two paths, both zero new dependencies:

- **Event type editor** — a "Folder" `<select>` listing "Ungrouped" and every
  folder, with helper text stating folders organize the dashboard only and are
  never shown to invitees. It deliberately has no "New folder…" option: the
  header button and the list row's menu already cover creation, and a third
  creation path inside the form would need its own error handling for a name
  collision mid-edit.
- **List row** — a "Move to" control in the existing action cluster, listing
  every folder plus "Ungrouped" with a check against the row's current folder.
  When no folders exist yet, it offers a single "New folder…" item that opens
  the same inline creation input as the header button, so the control is never
  an empty menu. Uses `PATCH .../folder`.

Drag and drop was rejected: it needs either a new npm dependency, which the
budget rules in `CLAUDE.md` forbid without justification, or hand-rolled pointer
handling plus a separate accessible fallback for keyboard and touch.

## Tests

`tests/api/event-type-folders.test.ts`:

- create, rename, reorder, delete round trip
- duplicate name in one workspace → 409 `folder_name_taken`
- same name in two different workspaces → both succeed
- case-insensitive collision: creating "franchise" when "Franchise" exists → 409
- deleting a folder un-groups its event types and deletes none of them
- assigning a folder id from another workspace → 404 `folder_not_found`
- a folder id from another workspace in `eventTypeBodySchema` is likewise rejected

`tests/db/` — a test pinning deterministic ordering from
`listEventTypesForUser`, which would fail against today's unordered query.

## Out of scope

- **Nesting.** One level. Depth costs tree state, move semantics, and a depth
  limit, for a set of tens of event types.
- **Bulk multi-select.** Filing an existing set happens once, one row at a time,
  through the Move to menu. A second selection interaction mode is not worth
  building on a guess about how painful that one-time sort is.
- **Public booking page sections.** The model does not preclude it — a future
  change could render folders as headed sections — but nothing here builds
  toward it, and no schema is shaped around the possibility.
- **Per-user folder views.** Folders are workspace-wide. Personal organization
  layered over shared event types is a different feature.

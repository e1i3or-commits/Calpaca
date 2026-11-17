# Brand standard and UI kit

The contract for every Calpaca screen. New UI and changed screens use this
vocabulary instead of page-specific colors, controls or spacing.

## Surfaces

Calpaca has two kinds of page, and they are themed differently.

| Surface | Pages | Tokens come from |
| --- | --- | --- |
| **Organizer** | App entry, sign-in, dashboard, onboarding, polls, marketing | `[data-organizer]` in `web/src/styles.css` (light + `[data-appearance="dark"]`) |
| **Invitee** | Booking, reschedule, cancel, one-off offers, signup sheets, proposals, routing forms | The host's chosen theme, set as `data-theme` on `<html>` by `web/src/lib/theme.ts`; blocks in `web/src/themes.css` |

An organizer page wraps its root in `data-organizer`. An invitee page never
does: it must look like the host's brand, not Calpaca's.

## Brand

- **Name:** Calpaca, one word, capital C only.
- **Mark:** the alpaca, `web/public/icons/llama.svg`, rendered by
  `<BrandMark />` (`web/src/components/brand-mark.tsx`). It is decorative
  (`alt=""`); the word "Calpaca" beside it carries the name. Source files and
  favicons are in `design/LOGOS/`.
- **Brand green:** the mark's fill, `#316b4a`. Organizer `--primary` is
  `oklch(0.455 0.095 158)`; the `calpaca` booking theme uses the mark's exact
  value, `oklch(0.479 0.082 156.5)`.
- **Organizer canvas:** warm off-white (`oklch(0.978 0.008 78)`) with warm ink,
  not pure white and grey.
- **Wordmark type:** `text-lg font-semibold tracking-[-0.03em]` beside the
  mark.

## Tokens

Components use only these Tailwind names (mapped in `styles.css` `@theme`),
never raw colors, so a theme is nothing but a token block.

| Role | Utilities | Use for |
| --- | --- | --- |
| Canvas | `bg-background` `text-foreground` | Page body |
| Surface | `bg-card` `text-card-foreground` | Cards, sheets, toasts |
| Quiet | `bg-muted` `text-muted-foreground` | Secondary text, hover, subtle panels |
| Line | `border-border` | All separators and outlines |
| Primary | `bg-primary` `text-primary-foreground` `text-primary` | One main action per area; links; selected state |
| Focus | `ring-ring` | `focus-visible` rings, always visible |
| Warning | `bg-warning` `text-warning-foreground` | Needs attention, not broken |
| Danger | `bg-destructive` `text-destructive` | Destructive actions and errors only |

Radius comes from `--radius`: `rounded-lg` for cards and inputs, `rounded-md`
for buttons, `rounded-full` only for avatars, counts and chips.

Adding a booking theme is one entry in `src/core/theming/themes.ts` and one
block in `themes.css`; private themes are covered in
[SELF-HOSTING.md](SELF-HOSTING.md#private-themes).

## UI kit

Primitives live in `web/src/components/ui/`. Use them before hand-rolling a
control.

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `ui/button.tsx` | Variants `default` (primary), `outline`, `ghost`, `destructive`; sizes `default`, `sm`, `lg` |
| `Card` | `ui/card.tsx` | Surface container, with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` |
| `Input`, `Textarea`, `Label` | `ui/input.tsx`, `ui/textarea.tsx`, `ui/label.tsx` | Always pair a field with a visible label |
| `Sheet` | `ui/sheet.tsx` | The add/edit surface (below); sizes `md`, `lg`, `xl` (multi-section editors) |
| `FormSection`, `ChoiceList` | `ui/form-section.tsx` | A titled group of fields or choices (below) |
| `BrandMark` | `brand-mark.tsx` | The alpaca mark |
| `AvatarUpload` | `avatar-upload.tsx` | Photo picker; never show a raw `<input type="file">` |
| `AlpacaLoader` | `alpaca-loader.tsx` | Full-section loading state |
| `InlineLoading`, `ActionableEmptyState` | `dashboard-primitives.tsx` | Inline loading text; empty state with a next action |
| `UpdateNotice` | `update-notice.tsx` | New-deploy refresh prompt (below) |

Class names merge through `cn()` (`web/src/lib/utils.ts`); variants use
`class-variance-authority`.

## Form controls

Fields share one look: `border-input` (the `--border` color, never the text
color), `bg-card`, and on focus a `--ring` border with a soft ring. On
organizer pages `styles.css` also gives every native control the standard
treatment, so a plain `<select>` or checkbox needs no extra classes:

- **Select:** custom chevron, room reserved on the right.
- **Checkbox:** 18px, rounded, brand green with a check when on.
- **Radio:** the same, round, with a green dot.

Invitee pages keep native controls so they follow the host's theme.

## Section titles

Group related fields or choices with `FormSection`: a semibold 14px title, an
optional one-line hint, an optional action on the right ("Add dates"), then
12px down to the content. Checkbox and radio choices sit in a `ChoiceList`, one
bordered box of 40px rows; give it `sm:grid-cols-2` for long lists. Never a bare
`<legend>` with choices tight beneath it.

## Add and edit

Creating or editing a record opens a **`Sheet`** from the right (full screen
on phones), never a form expanded inline in the list and never a separate page
that replaces it. The list stays put behind it. Editors with their own URL
(`/new`, `/$id/edit`) keep it: the route opens the sheet over the list, and
closing navigates back to the list's URL.

- Title says the action: "New team", "Edit booking page".
- **Cancel** then the primary action sit in the sheet footer, right-aligned.
  A form that owns its buttons uses `form="<id>"` on the footer's submit
  button, or a sticky footer row inside the form.
- Save errors render inside the sheet; the page behind is covered.
- Escape, the close button and the backdrop all close it; focus is trapped
  inside and returns to the opener (`useModalBehavior`).

## Interaction rules

- **Targets:** 44px minimum on touch (`h-11` / `min-h-11`); controls may
  compact at `lg:` (see `Button` sizes).
- **Status:** text plus icon or shape, never color alone. Live updates use
  `role="status" aria-live="polite"`; errors use `role="alert"`.
- **Motion:** decorative animation stops under `prefers-reduced-motion`, which
  `styles.css` enforces globally.
- **Copy:** sentence case; plain words ("Refresh", "Save draft"), no jargon.
- **Layout:** works from 320px wide with no horizontal page scroll.
- **Actions on phones:** page and card actions ("New poll", "Invite", "Add
  dates") are full width, one per row, below the title (`w-full sm:w-auto`);
  from `sm` up they sit beside the title at natural width.
- **List filters:** search stays inline; every other filter lives behind one
  `FilterButton` (shows the active count) that opens a `Sheet` with **Reset**
  and **Done**. No row of dropdowns above a list.
- **Row actions:** a list row's actions are one segmented control (Copy link |
  Embed | Move) plus icon buttons for edit and delete; clicking the row's title
  opens the editor.

## New-deploy refresh

Every web build gets a random build id. Vite bakes it into the bundle as
`__CALPACA_BUILD_ID__` and emits `dist/web/version.json` with the same id; the
server serves that file `Cache-Control: no-store`. While a tab is visible,
`useReleaseUpdate` (`web/src/lib/use-release-update.ts`) fetches it on load,
on focus and every 60 seconds. When the id differs (a rollback counts),
`UpdateNotice` shows **An update is available** with a **Refresh** button.

It never reloads on its own, so nobody loses a half-filled form. It is
skipped in development and inside embedded booking widgets, and it takes the
organizer palette on organizer pages and the host's theme on booking pages.

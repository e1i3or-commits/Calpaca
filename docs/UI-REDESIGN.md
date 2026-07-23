# Organizer UI redesign

## Direction

Redesign Calpaca's authenticated organizer experience as a calm scheduling
workspace: modern, extremely legible, mobile-first, and sparse without feeling
anonymous. The product should feel closer to a well-kept field notebook than
an enterprise control panel.

This proposal concerns the dashboard/admin UI. The public booking page keeps
its theme system, but should share the same interaction quality and core
components.

## Design principles

1. **The next action is obvious.** Each screen gets one primary action.
2. **Summary first, configuration second.** Show what is happening before
   exposing how every setting works.
3. **Progressive disclosure.** Common settings stay visible; advanced limits,
   routing, and delivery details open on demand.
4. **Mobile is the base layout.** Desktop adds room and persistent navigation,
   not different capabilities.
5. **Calm confidence.** Use whitespace, typography, and state language before
   borders, shadows, badges, or color.
6. **Character in small doses.** A warm palette, gentle shapes, and concise
   alpaca-flavored microcopy—not mascots on every empty state.

## Information architecture

The current horizontal tabs put unrelated setup areas at the same level and
will become harder to scan as bookings, workflows, insights, polls, and
sign-up sheets arrive.

### Primary navigation

| Destination | Contents |
| --- | --- |
| **Home** | Today, next booking, setup health, recent activity, quick create |
| **Scheduling** | Event types, one-off links, polls, sign-up sheets |
| **Bookings** | Upcoming, past, cancelled, booking detail |
| **Automations** | Workflows, webhooks, delivery health |
| **Insights** | Outcomes, no-show rate, lead time, assignment fairness |
| **More** | Availability, teams, people, routing, calendars, settings |

Desktop uses a narrow left rail. Mobile uses a four-item bottom bar—Home,
Scheduling, Bookings, More—with Automations and Insights inside More. The
bottom bar respects safe-area insets and disappears while a full-screen form
is active.

### Context navigation

- Scheduling opens with tabs for **Event types**, **One-off**, **Polls**, and
  later **Sign-up sheets**.
- More is a simple grouped list, not a second dashboard:
  - My setup: Availability, Calendars, Profile
  - Team: People, Teams, Routing
  - Platform: Integrations, API & MCP, Settings
- Editors use a back link and page title. Do not nest another application
  sidebar inside the editor.

## Core screen concepts

### Home

The dashboard should answer “What needs my attention?” in five seconds.

Top to bottom:

1. Greeting and compact **Create** button.
2. Next booking card with time, invitee, event type, delivery state, and
   Join/Open action.
3. Three small metrics: bookings this week, no-show rate, median lead time.
4. Attention list, shown only when needed:
   - calendar sync unhealthy;
   - invite delivery failed;
   - pending team invite;
   - webhook retries exhausted.
5. Recent activity timeline, maximum five rows.

When everything is healthy, replace the warning area with one concise line:
“Everything is in step.”

### Scheduling

Use a list on mobile and a roomy two-column card grid on desktop. Each event
type card contains:

- colored 3px accent and event title;
- duration and mode in plain text;
- host avatar stack;
- short `/book/slug` link;
- on/off state;
- inline Copy link button;
- overflow menu for Preview, Duplicate, Disable, Delete.

The page-level Create button opens a small chooser:

- Booking link
- One-off meeting
- Meeting poll
- Sign-up sheet (when available)

Do not expose all creation fields in the list. Creation and editing happen on
a dedicated route with autosaved draft state or an explicit sticky Save bar.

### Event type editor

Desktop: 680–760px content column with a 280px live summary/preview rail.
Mobile: one column with a sticky bottom Save action.

Sections:

1. Basics — title, duration, location.
2. Hosts — solo, round robin, or together.
3. Availability — schedule, range, overrides.
4. Booking form — name/email plus custom questions.
5. Limits — buffers, notice, caps.
6. Communications — attached workflows.
7. Appearance — theme and preview.
8. Advanced — agent policy, webhook metadata, destructive actions.

Each collapsed section shows its effective value (“Weekdays · 9–5 · New
York”), making the editor scannable without opening everything.

### Bookings

Default to a chronological agenda rather than a dense table.

- Segmented control: Upcoming / Past / Cancelled.
- Search and filters live in a single filter sheet on mobile.
- Day headings remain sticky while scrolling.
- Booking row: time block, invitee, event, host(s), status.
- Only exceptional status is colorful: failed delivery, no-show, cancelled.
- Tap opens a full detail page on mobile and a side sheet on wide desktop.

Detail order:

1. Meeting summary and primary action.
2. Invitee and notes.
3. Calendar/invite delivery health.
4. Host assignment explanation when applicable.
5. Routing answers.
6. Event timeline.
7. Destructive actions at the bottom.

No-show uses a plain confirmation dialog that states the workflow/webhook
effects. Technical event payloads stay behind “View raw details.”

### Automations

Show user-authored workflows first and webhooks second. Delivery failures form
one shared “Needs attention” queue.

Workflow cards read as sentences:

> 24 hours before a meeting → email the invitee

The editor follows the same sentence structure: **When**, **Wait**, **If**,
**Do**. Avoid a node-canvas builder until branching genuinely requires one.

### Insights

Start with four views already supported by the database:

- Outcomes
- No-shows
- Lead time
- Round-robin fairness

Use one strong chart or table per view, a shared date/event-type filter, and
an Export CSV action. Provide a sentence above each visualization:
“1 of 24 completed meetings was marked no-show.”

Analytics should explain, not decorate. No dashboard grid of twelve tiny
charts.

### Setup and integrations

Calendars are connection cards with:

- provider and account;
- calendars checked for conflicts;
- write destination;
- last sync and health;
- reconnect/disconnect actions.

Schedules use a seven-row weekly editor. Exceptions/OOO appear directly below
the recurring week rather than on a distant settings page.

Teams and people use compact member rows with role, calendar health, OOO
state, and overflow actions.

## Mobile behavior

- Base viewport: 390px; no horizontal scrolling except an explicitly labeled
  date strip.
- Touch targets: at least 44×44px.
- Forms use native-friendly controls and one column.
- Primary form action is sticky above the safe area.
- Tables transform into labeled rows/cards; never shrink columns until text is
  unreadable.
- Filters and secondary actions use bottom sheets.
- Details become routes, not nested modals.
- Preserve form state across back navigation and recover drafts after a
  failed request.
- Use optimistic feedback only for reversible actions such as copying or
  toggling active state; bookings and destructive actions wait for the server.

## Visual language

### Palette

Keep surfaces neutral and let status colors retain meaning.

- Canvas: warm off-white (`#FAF9F6`) in light mode.
- Cards: near-white with a subtle warm edge.
- Ink: charcoal, not pure black.
- Primary: deep juniper/green.
- Character accent: muted apricot or terracotta, used for illustrations,
  selected calendar days, and tiny highlights—not primary buttons.
- Status: restrained emerald, amber, and brick.

Dark mode can follow later, but token names must support it from the redesign's
first commit.

### Typography

- Use a clean variable sans if it can be self-hosted within the asset budget;
  otherwise use the existing system stack.
- Page title: 28–32px, medium weight.
- Section title: 17–19px, semibold.
- Body: 14–16px with generous line height.
- Metadata: 12–13px; never lighter than accessible contrast.
- Tabular numerals for times, counts, and analytics.

### Shape and depth

- Radius: 12px cards, 10px controls, pill only for compact statuses.
- Borders over shadows. One subtle elevation level for floating sheets and
  menus only.
- Use 8px spacing increments with occasional 4px optical adjustments.
- Icons are 16–18px line icons; pair unfamiliar icons with text.

### Bits of character

- A tiny alpaca-ear notch can appear in the brand mark and empty-state
  illustration silhouette.
- Empty calendar: “Wide open. Your future self says thanks.”
- Healthy integrations: “Everything is in step.”
- Copied link feedback: “Link tucked away.”
- Loading skeletons may use a very subtle wool-like scallop at one edge.
- Celebrate the first published booking link once, without fanfare. Avoid confetti in
  routine organizer work.

Character must never obscure a status, slow a task, or make error copy cute.

## Component system

Add a small, deliberate layer to the existing shadcn-style primitives:

- `AppShell`, `DesktopRail`, `MobileNav`
- `PageHeader`, `SectionHeader`
- `StatusDot`, `HealthRow`
- `EmptyState`, `AttentionBanner`
- `AgendaList`, `BookingRow`
- `EntityCard`, `MemberStack`
- `FilterSheet`, `DetailSheet`
- `FormSection`, `StickyFormActions`
- `Metric`, `SimpleChartFrame`
- `ConfirmDialog`, `Toast`

Prefer composition over variants with dozens of boolean props. All primitives
need focus-visible, disabled, error, loading, and reduced-motion states.

## Interaction and content rules

- Labels use nouns: “Bookings,” not “Manage your bookings.”
- Buttons use verbs: “Create event type,” “Copy link,” “Mark no-show.”
- Show success near the action and errors beside the affected field.
- Translate API codes into specific next steps.
- Relative time supplements, never replaces, an exact timestamp.
- Every displayed meeting time names or clearly inherits the viewer's
  timezone.
- Destructive actions state what remains recoverable.
- Use skeletons for page loads and a spinner only inside an action control.

## Proposed implementation sequence

### R1 — Shell and tokens

- Extract the current dashboard into routed sections.
- Add responsive app shell, desktop rail, mobile bottom navigation, page
  header, status primitives, and revised tokens.
- Keep existing features functionally unchanged.

### R2 — Scheduling and setup

- Move event types, schedules, routing, teams, and calendars into dedicated
  pages.
- Replace inline event-type editing with a dedicated editor.
- Add compact health states and responsive list/card patterns.

### R3 — Operational surfaces

- Implement Task 27 Bookings in the new agenda/detail pattern.
- Add webhook delivery attention states and the analytics views.
- Build Home from real booking and health data.

### R4 — Invitee and new-domain consistency

- Implement Task 28 using the shared field, error, success, and mobile
  patterns.
- Apply the same primitives to polls, one-off links, and workflows as their
  roadmap phases land.

## Review checklist

- Desktop screenshots at 1440px and 1024px.
- Mobile screenshots at 390px and 430px.
- Keyboard-only pass through navigation, editor, filters, and dialogs.
- Screen-reader labels and logical headings.
- 200% zoom without clipped actions or horizontal overflow.
- Empty, loading, populated, degraded, and error state for every page.
- Long names, long emails, three-host stacks, and non-English text stress test.
- Timezone visible wherever ambiguity could change a decision.
- No screen uses more than one visually dominant action.

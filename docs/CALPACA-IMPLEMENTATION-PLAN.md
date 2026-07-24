# Calpaca Design Standard Migration Plan

Date: July 23, 2026  
Baseline: Calpaca 0.19.0 working tree  
Standards:

- `docs/CALPACA-UX-STRATEGY.md`
- `docs/CALPACA-PRODUCT-EXPERIENCE.md`
- `docs/CALPACA-PRODUCT-SPECIFICATION.md`

This plan preserves the existing scheduling engine, APIs, booking lifecycle, tenant themes, public links, and currently shipped coordination tools. It does not propose a visual rewrite.

## 1. Executive gap assessment

The existing application is not a failed version of the frozen product. It contains much of the technical foundation the product specification requires:

- scored availability and top-three “Best times”
- fragmentation, adjacency, preference, and focus-block signals
- transactional holds and conflict revalidation
- required and optional hosts
- quorum fallback
- weighted assignment
- calendar health and availability troubleshooting
- Google Calendar write-through
- invitee calendar overlay
- append-only booking history
- delivery status
- reschedule, cancellation, no-show, and suggestion lifecycle
- routing, webhooks, API, MCP, teams, workspaces, custom domains, and theming

The primary gap is that these capabilities are presented as independent scheduling features rather than evidence and actions inside an Engagement.

The migration should therefore:

1. preserve the engine and lifecycle;
2. correct inexpensive clarity and accessibility defects now;
3. add durable routes around current screens;
4. introduce Engagement as additive context;
5. adapt current event types into Conversation playbooks;
6. expose existing scoring provenance as recommendations;
7. add Proposal, Preparation, Outcome, and Recovery incrementally.

## 2. Phase 1 gap analysis

### 2.1 Public and authentication screens

| Screen | Already matches | Partially matches | Conflicts with standard | Preserve unchanged |
| --- | --- | --- | --- | --- |
| Marketing `/` | Distinct Calpaca brand, hosted and self-hosted paths, visible pricing | Explains scheduling breadth | Generic horizontal scheduling story; no agency wedge, Engagement, delivery protection, continuity, or recovery proof | Brand mark, pricing facts, self-hosting path, restrained palette |
| Sign in | One clear provider action, calendar-oriented explanation | Updated to say account creation and calendar connection | Does not separate permission purposes, offer a sample, or begin the five-minute proof | Google OAuth, current page structure, Home exit |
| Booking catalogue `/booking/*` | Custom branding, selected event types, descriptions, duration | Works as a publication surface | Event-type catalogue is not engagement-context scheduling | Existing routes, tenant themes, event selection |
| Direct booking `/book/*` | Scored best times, calendar and timezone handling, host roles, quorum, selectable durations, locations, questions, overlay, suggestion, confirmation | Recommendation order exists | Reasons, evidence freshness, Engagement, preparation, intended outcome, Proposal, and confidence are absent | Availability engine, hold and booking flow, theme support, calendar picker, all-times escape |
| Routing `/r/*` | Typed fields, field issues, rule evaluation | Can send users to relevant conversation | Public title derived from slug; rules operate outside Engagement context | Existing route and rule engine as legacy tool |
| Reschedule | Original time visible, ranked slot picker, replacement confirmation | Preserves booking lifecycle | Meeting identity is incomplete; no reason-led recovery or participant substitution | Signed-token security, old time retained until confirmed, slot engine |
| Cancel | Explicit destructive click protects against scanners; reason available | Completion state exists | Meeting identity absent; reschedule alternative and “conversation still required” absent | Signed-token security and explicit confirmation |
| Poll | Calendar-aware voting, explicit choices, lifecycle, public results, finalization | Useful internal coordination primitive | Result matrix is desktop-first; generic poll is not Engagement-centered | API, response editing, privacy, reminders, finalization |
| Sign-up sheet | Capacity, roster privacy, questions, cancellation, confirmations | Stable secondary tool | Outside agency wedge and primary experience | Existing behavior and routes under Tools |
| One-off offer | Exact-time private proposal, recipient restriction, atomic redemption | Closest current analogue to Proposal | Does not carry Engagement, roles, reasons, or response tradeoffs | Single-use capability and redemption lifecycle |
| Public terminal states | Several specific closed, cancelled, or unavailable states | Some recovery copy exists | Inconsistent exits and object identity | Token safety and current terminal correctness |

### 2.2 Organizer shell and daily work

| Screen | Already matches | Partially matches | Conflicts with standard | Preserve unchanged |
| --- | --- | --- | --- | --- |
| Organizer shell | Desktop sidebar, collapsible state, dark mode, mobile bottom navigation | Separates daily and setup features | One `/dashboard` stateful route; thirteen feature destinations; false mobile menu behavior; no deep links or history | Theme persistence, sidebar collapse preference, current feature access during migration |
| Home | Upcoming data and shortcuts exist | Attempts an attention-oriented summary | Generic greeting and metric-style content; not an exception queue | Existing summary APIs as inputs where useful |
| Mobile navigation | Major daily features reachable | Fixed bottom targets are physically usable | Six destinations are crowded; setup hidden behind a false menu action | Bottom navigation architecture until routed shell ships |
| Loading | Skeleton exists for initial dashboard | Alpaca loader used on public navigation | Literal loading text and generic tile skeletons vary by screen | Existing loader implementation where state matches |
| Global errors | Consistent destructive token | Some errors name API conditions | Many errors were not announced; organizer sub-screen errors remain inconsistent | Existing error mapping and visual treatment |

### 2.3 Scheduling inventory

| Screen | Already matches | Partially matches | Conflicts with standard | Preserve unchanged |
| --- | --- | --- | --- | --- |
| Event types | Extensive configuration, host modes, schedules, locations, questions, themes, layouts, embed output | Can represent many Conversation playbook inputs | Giant inline editor, creation mixed with list, database-shaped fields, no Engagement or outcome | Event-type API, validation, schedule references, host logic, questions, locations |
| Booking pages | Ordered selected event types, theming, descriptions | Useful publication surface | Generic catalogue rather than private engagement scheduling | Current records and public routes |
| One-off offers organizer | Exact slots, recipient restriction, revoke and lifecycle | Useful Proposal precursor | Hidden under setup and lacks Engagement context | API and lifecycle |
| Availability | Named schedules, overrides, OOO, forwarding, timezone | Reusable policy input | Repetitive configuration, no effective delivery-policy comparison | Temporal correctness and schedule engine |
| Routing | Typed fields, rules, host or event destinations | Can support role matching later | Technical builder exposes keys, clauses, and operators | Pure rule engine and legacy forms |
| Troubleshooter | Per-host policy, schedule, time off, buffer, and conflict explanations | Strong recovery foundation | Separate destination rather than contextual repair | Diagnostic API and reason coverage |

### 2.4 Meetings and coordination

| Screen | Already matches | Partially matches | Conflicts with standard | Preserve unchanged |
| --- | --- | --- | --- | --- |
| Bookings list | Searchable booking data, lifecycle status, detail access | Meeting operations foundation | “Booking” rather than confirmed Meeting; no Engagement, readiness, outcome, or next action | Admin booking APIs, filters, CSV, status |
| Booking detail drawer | Assignment, delivery, questions, notes, no-show, history | Contains important trusted context | Inaccessible custom dialog; transient rather than durable route | All displayed data and actions |
| Polls organizer | Smart suggestions, invitations, finalization, controls, result data | Internal coordination foundation | Creation, list, detail, and results share one long page | Poll API and lifecycle |
| Sign-up organizer | Sessions, capacity, questions, roster administration | Stable secondary capability | Form-first, outside wedge | Existing secondary tool |
| Analytics | Outcomes, lead time, no-show, assignment balance, CSV | Some future Insight inputs | Generic dashboard presentation, no Engagement or delivery/continuity measures | SQL views and export |

### 2.5 People, account, and workspace

| Screen | Already matches | Partially matches | Conflicts with standard | Preserve unchanged |
| --- | --- | --- | --- | --- |
| Profile & API | Profile image, name, title, timezone, token lifecycle | Useful account and developer settings | Personal profile and API access combined | APIs and stored values |
| People & teams | Invitations, roles, team visibility, membership, admin safety | Foundation for Engagement roles | Users and teams crowded together; no scheduling readiness or Engagement assignments | Authorization rules and lifecycle |
| Calendars | Conflict calendars, write destination, connect/disconnect, provider data | Strong Connection foundation | Health, freshness, permission purpose, and affected objects are weakly summarized | Sync architecture and provider controls |
| Workspace identity | Organization title, slug, domain verification | Foundation for trusted public identity | Distributed across profile/workspace areas | Domain and tenancy APIs |
| API tokens | Create, list, revoke | Fits Connection model later | Located under Profile; scope and last-use depth limited | Token API and security |

### 2.6 Cross-product states

| Area | Already matches | Gap | Preserve |
| --- | --- | --- | --- |
| Time handling | Timezone is first-class; backend is DST-safe | Some public summaries need stronger timezone repetition | All Temporal and UTC behavior |
| Recommendations | Best times and score exist | No user-facing deterministic reasons or freshness | Scoring pipeline |
| Confidence | Calendar health can become stale | No canonical Confirmed, Needs confirmation, Unknown, Stale model | Sync health signals |
| Approvals | Some request/finalize flows | No shared explicit-plan approval pattern | Existing finalization semantics |
| Accessibility | Labels and focus rings exist in many controls | Dialog focus, error announcements, pressed states, mobile tables, semantics | Native inputs and current focus tokens |
| Mobile | Public booking largely stacks; organizer bottom nav exists | Desktop forms and tables frequently compress or pan | Responsive styles that already work |

## 3. High-ROI principles

### Preserve

- Existing API contracts unless a new frozen object requires an additive endpoint.
- Existing public routes indefinitely through redirects or legacy handlers.
- Booking and availability correctness.
- Current themes for existing tenants.
- Current coordination tools as secondary Tools.
- Existing organizer data operations until a complete replacement workflow ships.

### Improve first

1. Truthfulness: controls must describe what they do.
2. State semantics: errors and selections must be programmatically exposed.
3. Durable navigation: wrap before replacing.
4. Context: add Engagement references before rebuilding forms.
5. Explanations: expose existing deterministic scoring before adding new intelligence.
6. Recovery: use current diagnostics and lifecycle before inventing automation.

### Avoid

- Restyling cards, radii, shadows, type, or colors without task benefit.
- Replacing current UI with an unrelated component library.
- Rewriting dashboard sections before route wrappers exist.
- Introducing AI language before scoring provenance.
- Removing legacy capabilities based on strategy alone.

## 4. Migration backlog

Complexity estimates assume one experienced engineer familiar with the codebase. Every ticket includes the required screenshot evidence. For nonvisual semantic work, the “after screenshot” must be paired with a DOM or accessibility-tree assertion because pixels cannot prove the change.

### Quick Wins, under one hour each

#### QW-01: Clarify sign-in and first-account behavior

- **Affected files:** `web/src/pages/sign-in-page.tsx`
- **Complexity:** Under 1 hour
- **Dependencies:** None
- **UX impact:** High at a trust-critical entry point
- **Engineering risk:** Low, copy and ARIA only
- **Before screenshot:** `docs/screenshots/migration-plan/qw-sign-in-before.png`
- **After screenshot:** `docs/screenshots/migration-plan/qw-sign-in-after.png`
- **Change:** Replace “Welcome back” with “Sign in or create an account,” state that new users create an account, and expose busy state.
- **Measure:** First-time testers correctly predict what Google continuation does.
- **Status:** Implemented

#### QW-02: Make the mobile setup shortcut truthful

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** Under 1 hour
- **Dependencies:** None
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot requirement:** Authenticated mobile `/dashboard`, header menu icon labelled “Open setup”
- **After screenshot requirement:** Same viewport, clock icon titled and labelled “Availability settings”
- **Change:** The control still opens Availability, but no longer pretends to open a menu.
- **Measure:** Accessible name and visible icon match destination.
- **Status:** Implemented

#### QW-03: Announce public and global organizer errors

- **Affected files:** `booking-page.tsx`, `cancel-page.tsx`, `reschedule-page.tsx`, `routing-form-page.tsx`, `poll-page.tsx`, `signup-sheet-page.tsx`, `sign-in-page.tsx`, `dashboard-page.tsx`
- **Complexity:** Under 1 hour
- **Dependencies:** None
- **UX impact:** High for screen-reader recovery
- **Engineering risk:** Low
- **Before screenshot requirement:** Each route with forced error; visual capture
- **After screenshot requirement:** Same visual capture plus accessibility-tree capture showing alert role
- **Change:** Add alert semantics without changing visual presentation.
- **Measure:** Dynamic errors are announced once.
- **Status:** Implemented for all public form errors and the global dashboard load error. Organizer sub-form errors remain S-01.

#### QW-04: Expose selected duration and poll choices

- **Affected files:** `web/src/pages/booking-page.tsx`, `web/src/pages/poll-page.tsx`
- **Complexity:** Under 1 hour
- **Dependencies:** None
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot requirement:** Duration choice and poll vote selected
- **After screenshot requirement:** Pixel-identical selected state plus accessibility-tree `pressed=true`
- **Change:** Add `aria-pressed`; keep existing visual state.
- **Measure:** Screen reader announces selected state and poll labels remain available on narrow screens.
- **Status:** Implemented

#### QW-05: Correct small native form semantics

- **Affected files:** `web/src/pages/signup-sheet-page.tsx`, `web/src/pages/reschedule-page.tsx`
- **Complexity:** Under 1 hour
- **Dependencies:** None
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot requirement:** Sign-up form and reschedule confirmation
- **After screenshot requirement:** Pixel-identical views plus DOM capture of required attributes and non-submit Back button
- **Change:** Mark required inputs programmatically and prevent Back from inheriting submit behavior.
- **Measure:** Browser and assistive technology expose required state correctly.
- **Status:** Implemented

#### QW-06: Add keyboard focus to linked booking-page cards

- **Affected files:** `web/src/pages/public-booking-page.tsx`
- **Complexity:** Under 1 hour
- **Dependencies:** None
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot requirement:** Keyboard-focused event link with no clear linked-card outline
- **After screenshot requirement:** Keyboard-focused event link with visible standard focus ring
- **Change:** Reuse existing ring token; no layout change.
- **Measure:** Every catalogue event link has a visible keyboard focus indicator.
- **Status:** Implemented

### Small, one to four hours

#### S-01: Finish organizer error semantics

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** 1 to 2 hours
- **Dependencies:** None
- **UX impact:** High
- **Engineering risk:** Low
- **Before screenshot:** Force one error in every tab; capture and record missing alert semantics
- **After screenshot:** Same states plus accessibility-tree alerts
- **Ticket:** Apply consistent alert or status semantics to every organizer sub-form. Avoid announcing persistent explanatory text.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-01/before.png` and
  `docs/screenshots/migration-plan/s-01/after.png`

#### S-02: Associate routing errors with fields

- **Affected files:** `web/src/pages/routing-form-page.tsx`
- **Complexity:** 2 hours
- **Dependencies:** None
- **UX impact:** High for failed routing completion
- **Engineering risk:** Low
- **Before screenshot:** Invalid routing form submission
- **After screenshot:** Same form with field-level error, focus on first invalid field, accessibility-tree description
- **Ticket:** Add `aria-invalid`, `aria-describedby`, required semantics, and focus recovery.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-02/before.png` and
  `docs/screenshots/migration-plan/s-02/after.png`

#### S-03: Add Copy-link success feedback

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** 2 to 3 hours
- **Dependencies:** None
- **UX impact:** Medium across sharing workflows
- **Engineering risk:** Low
- **Before screenshot:** Copy action with no durable confirmation
- **After screenshot:** “Copied” state announced and visible without layout shift
- **Ticket:** Reuse button label state; no toast system.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-03/before.png` and
  `docs/screenshots/migration-plan/s-03/after.png`

#### S-04: Make loading copy consistent in organizer tabs

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** 2 to 4 hours
- **Dependencies:** None
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot:** Each literal “Loading…” state
- **After screenshot:** Compact shared in-place progress treatment
- **Ticket:** Reuse current skeleton or inline progress according to final shape. Do not introduce a new animation.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-04/before.png` and
  `docs/screenshots/migration-plan/s-04/after.png`

#### S-05: Add next actions to dead-end empty states

- **Affected files:** `web/src/pages/dashboard-page.tsx`, `web/src/pages/public-booking-page.tsx`
- **Complexity:** 3 to 4 hours
- **Dependencies:** Existing create handlers
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot:** Empty Event types, schedules, routing, teams, offers, polls, pages
- **After screenshot:** One reason and one relevant existing action
- **Ticket:** Use current buttons and inline creation. Do not add illustrations.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-05/before.png` and
  `docs/screenshots/migration-plan/s-05/after.png`

#### S-06: Increase mobile hit areas without changing desktop density

- **Affected files:** `web/src/components/ui/button.tsx`, page-specific icon actions
- **Complexity:** 3 to 4 hours
- **Dependencies:** Screenshot suite
- **UX impact:** High on mobile
- **Engineering risk:** Medium due to wrapping
- **Before screenshot:** 320, 390, and 768 control measurements
- **After screenshot:** Same screens with minimum 44px hit targets and no overflow
- **Ticket:** Use responsive minimum sizes and invisible hit area where layout requires.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-06/before-320.png`,
  `before-390.png`, `before-768.png`, and their matching `after-*.png`
  screenshots. Primary and utility actions measure at least 44px with no
  horizontal overflow at all three viewports.

#### S-07: Give sign-in errors actionable language

- **Affected files:** `web/src/pages/sign-in-page.tsx`, authentication error mapping
- **Complexity:** 2 to 3 hours
- **Dependencies:** Known auth failure codes
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot:** “Is the API running?” production-facing error
- **After screenshot:** User-safe retry and support guidance; developer detail excluded
- **Ticket:** Map network, popup, state, and provider failure where observable.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/s-07/before.png` and
  `docs/screenshots/migration-plan/s-07/after.png`

#### S-08: Label legacy Tools in current navigation copy

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** 2 to 4 hours
- **Dependencies:** Product migration communication
- **UX impact:** Low now, high during migration
- **Engineering risk:** Medium if users interpret deprecation
- **Before screenshot:** Polls and Sign-ups as primary peers
- **After screenshot:** Only after routed shell, secondary Tools placement
- **Ticket:** Do not implement in current shell before N-01.
- **Status:** Implemented after L-01 and L-02
- **Evidence:** `docs/screenshots/migration-plan/s-08/before.png` and
  `after.png`. Polls, Sign-up sheets, Routing, and One-off offers now appear
  under a distinct Tools label, separate from daily and Workspace navigation.

### Medium, approximately half a day

#### M-01: Make booking detail drawer keyboard complete

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** Half day
- **Dependencies:** None
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** Booking drawer open desktop and mobile; keyboard trace
- **After screenshot:** Same visual structure with focus trap, Escape, initial focus, scroll lock, and focus return
- **Ticket:** Preserve drawer content and styling. Implement behavior only.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/m-01/before-390.png`,
  `after-390.png`, `before-1280.png`, and `after-1280.png`. Browser traces
  confirm initial focus, forward and reverse containment, Escape close,
  background scroll restoration, and return to the opening booking row.

#### M-02: Replace mobile poll result panning with ranked summaries

- **Affected files:** `web/src/pages/poll-page.tsx`, `web/src/pages/dashboard-page.tsx`
- **Complexity:** Half day
- **Dependencies:** Existing poll result data
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** 390px horizontal matrix
- **After screenshot:** Ranked candidate summaries with participant detail disclosure; desktop matrix unchanged
- **Ticket:** No API change.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/m-02/before-390.png`,
  `after-390.png`, and `after-1280.png`. The mobile view has no horizontal
  overflow, participant details remain available on demand, and the desktop
  matrix is unchanged.

#### M-03: Progressive disclosure in existing EventTypeForm

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** Half day
- **Dependencies:** None
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** Full form at desktop and mobile
- **After screenshot:** Basics visible; Hosts, Availability, Location, Invitee form, Appearance, Sharing in named disclosures; invalid section forced open
- **Ticket:** Preserve all fields, payload, and save location. This is an interim improvement, not the final playbook editor.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/m-03/before-390.png`,
  `after-390.png`, `before-1280.png`, and `after-1280.png`. Browser checks
  confirm all six named sections, visible Basics, default-open Hosts, no
  horizontal overflow, and automatic reopening of a server-invalid section.

#### M-04: Improve event-type validation focus

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** Half day
- **Dependencies:** Current validation-path mapping
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** Invalid summary
- **After screenshot:** Summary links focus exact field; field invalid state and message visible
- **Ticket:** Do not change server validation.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/m-04/before.png` and
  `after.png`. A server-rejected title now has a linked inline message,
  `aria-invalid`, a visible invalid state, and exact focus from the summary.

#### M-05: Add specific public terminal recovery

- **Affected files:** public pages and `web/src/main.tsx`
- **Complexity:** Half day
- **Dependencies:** Existing safe fallback URLs
- **UX impact:** Medium
- **Engineering risk:** Low
- **Before screenshot:** unavailable page, expired offer, closed sheet, invalid cancellation
- **After screenshot:** specific state, unchanged facts, safe return or contact action
- **Ticket:** Preserve token privacy.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/m-05/before-offer.png`,
  `after-offer.png`, and `after-not-found.png`. Expired offers, invalid
  cancellation and reschedule links, closed sign-up sheets, and unknown routes
  now provide a safe recovery path without exposing token details.

#### M-06: Present Calendars by purpose and health

- **Affected files:** `web/src/pages/dashboard-page.tsx`
- **Complexity:** Half day
- **Dependencies:** Existing calendar fields
- **UX impact:** High
- **Engineering risk:** Low
- **Before screenshot:** Current calendar rows
- **After screenshot:** “Checks conflicts on,” “Adds new meetings to,” account identity, and current health
- **Ticket:** No provider or API change.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/m-06/before.png` and
  `after.png`. Existing calendar data now communicates account identity,
  conflict-checking purpose, write destination, and sync health directly.

### Large, one to three days

#### L-01: Add route-backed wrappers for current organizer tabs

- **Affected files:** `web/src/main.tsx`, `web/src/pages/dashboard-page.tsx`, new route-level page modules
- **Complexity:** 2 to 3 days
- **Dependencies:** Route map ratification
- **UX impact:** Very high
- **Engineering risk:** Medium
- **Before screenshot:** Current `/dashboard` with selected tab and refresh reset
- **After screenshot:** Identical screen at durable `/app/...` route with active navigation
- **Ticket:** First migration architecture ticket. No page redesign.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/l-01/before.png` and
  `after.png`. Browser checks cover 14 durable views, `/app` redirection,
  direct refresh, Back history, active content, transitional legacy views,
  and continued `/dashboard` compatibility.
- **Migration note:** One-off offers uses `/app/tools?view=one-off-offers`
  under the specification's legacy Tools governance. The advanced
  Troubleshooter uses `/app/workspace/availability?view=troubleshooter`.

#### L-02: Ship four-destination mobile shell

- **Affected files:** routed AppShell
- **Complexity:** 1 to 2 days
- **Dependencies:** L-01
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** Six-item bottom nav and setup shortcut
- **After screenshot:** Home, Engagements placeholder, Meetings, More
- **Ticket:** Preserve every current destination under More during migration.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/l-02/before-390.png`,
  `after-320.png`, `after-390.png`, `after-more-390.png`, and
  `after-768.png`. Checks confirm four mobile destinations, every legacy
  destination in More, 48px targets, keyboard close and focus return, correct
  durable routing, no mobile overflow, and the unchanged desktop sidebar.

#### L-03: Separate event-type list and editor routes

- **Affected files:** EventTypesTab and EventTypeForm extraction, route modules
- **Complexity:** 2 days
- **Dependencies:** L-01
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** List and inline form
- **After screenshot:** Same list; focused editor route with unchanged controls
- **Ticket:** No Conversation reframe yet.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/l-03/before-inline-1280.png`,
  `after-new-1280.png`, and `after-edit-390.png`. Browser checks confirm
  refresh-safe new and edit routes, list-to-editor navigation, cancel-to-list
  behavior, preserved form values, and focused editors without the custom
  booking-page manager.

#### L-04: Give bookings durable meeting-detail routes

- **Affected files:** BookingsTab, BookingDetailPanel, route modules
- **Complexity:** 1 to 2 days
- **Dependencies:** L-01, M-01 behavior
- **UX impact:** High
- **Engineering risk:** Low to medium
- **Before screenshot:** transient drawer
- **After screenshot:** same information on `/app/meetings/:id`; optional accessible desktop preview
- **Ticket:** Preserve current actions and API.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/l-04/after-390.png`,
  `before-1280.png`, and `after-1280.png`. Browser checks confirm direct
  links, refresh, list-to-detail URLs, close-to-list behavior, Escape, Back,
  and focus restoration to the opening meeting row.

#### L-05: Split account, workspace, people, and connection settings

- **Affected files:** ProfileTab, WorkspaceCard, UserManagementPanel, TeamTab, CalendarsTab, route modules
- **Complexity:** 2 to 3 days
- **Dependencies:** L-01
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** combined Profile & API and People & teams
- **After screenshot:** routed sections using existing forms and APIs
- **Ticket:** Structural move only, no new permissions.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/l-05/before-profile.png`,
  `before-people.png`, `after-profile-1280.png`,
  `after-workspace-1280.png`, `after-more-390.png`, and
  `after-more-lower-390.png`. Browser checks confirm focused, refresh-safe
  Account profile, Workspace general, Workspace API, People, and Calendars
  destinations plus complete mobile discovery. Existing forms, APIs, and
  permissions are unchanged.

#### L-06: Contextual availability diagnostics

- **Affected files:** EventTypeForm, booking availability errors, troubleshooter UI
- **Complexity:** 1 to 2 days
- **Dependencies:** Durable routes
- **UX impact:** High
- **Engineering risk:** Medium
- **Before screenshot:** standalone troubleshooter
- **After screenshot:** prefilled diagnostic reached from event type or unavailable time
- **Ticket:** Preserve standalone tool as advanced entry.
- **Status:** Implemented
- **Evidence:** `docs/screenshots/migration-plan/l-06/before-standalone-1280.png`,
  `after-event-link-1280.png`, and `after-prefilled-390.png`. Browser checks
  confirm event, duration, and optional time prefill through the durable URL.
  Existing event types open diagnostics in a new tab to preserve unsaved
  editor drafts, while the standalone advanced entry remains available.

### Epics

#### E-01: Engagement additive model

- **Affected files:** schema, migrations generated by Drizzle, core types, API routes, organizer pages
- **Complexity:** Epic
- **Dependencies:** L-01, lifecycle and permission ratification
- **UX impact:** Foundational
- **Engineering risk:** High
- **Before screenshot:** Scheduling and Bookings without client-work parent
- **After screenshot:** Engagement list and overview per specification 3.3 and 3.5
- **Ticket:** Implement Specification Milestone 1. Existing bookings and event types may remain unassigned.
- **Status:** Implemented
- **Evidence:** Generated migration `0043_tiresome_marrow.sql`; lifecycle and
  permission tests; tenant-scoped Engagement API tests; durable list, create,
  and overview routes at `/app/engagements`, `/app/engagements/new`, and
  `/app/engagements/:id`. Draft persistence, duplicate-client warning, and
  restricted discovery are implemented without changing booking mutations.

#### E-02: Conversation playbooks over event types

- **Affected files:** event-type schema/API adapter, Engagement routes, playbook editor
- **Complexity:** Epic
- **Dependencies:** E-01, L-03
- **UX impact:** Foundational
- **Engineering risk:** High
- **Before screenshot:** EventTypeForm
- **After screenshot:** Conversations and playbook editor per 3.6 and 3.7
- **Ticket:** Existing event settings remain source-of-truth until mapping is verified.
- **Status:** Implemented
- **Evidence:** Generated migration `0044_superb_red_hulk.sql`; pure readiness
  tests; API and database adapter tests; Engagement Conversation list, reusable
  workspace playbooks, and focused playbook editor at durable Engagement
  routes. Existing event-type identifiers and public booking behavior remain
  authoritative, while workspace playbooks are copied rather than consumed.

#### E-03: Explainable recommendation provenance

- **Affected files:** availability scoring output, API serialization, booking UI, organizer proposal flow
- **Complexity:** Epic
- **Dependencies:** deterministic provenance contract
- **UX impact:** Differentiating
- **Engineering risk:** High
- **Before screenshot:** Best times without reasons
- **After screenshot:** Recommendation review per 3.9
- **Ticket:** No generated reasons lacking deterministic signal.
- **Status:** Implemented
- **Evidence:** Availability scoring now emits structured deterministic signals
  without changing slot eligibility or ordering. The API derives calendar
  confidence from conflict-enabled connection health and sync freshness, and
  serializes two to four public-safe reasons for every recommended time. The
  booking UI exposes confidence, evidence freshness, and an expandable
  explanation without showing internal scores, identifiers, or provider
  details. Pure core, API, and database adapter tests cover the contract.

#### E-04: Proposal lifecycle

- **Affected files:** schema, API, jobs, public routes, organizer routes, booking conversion
- **Complexity:** Epic
- **Dependencies:** E-01, E-02, E-03
- **UX impact:** Differentiating
- **Engineering risk:** High
- **Before screenshot:** direct booking and one-off offer
- **After screenshot:** proposal detail and public proposal per 3.10 and 3.11
- **Ticket:** Terminate in existing hold and booking lifecycle.
- **Status:** Implemented
- **Evidence:** Generated migrations `0045_magenta_young_avengers.sql`,
  `0046_early_ser_duncan.sql`, and `0047_medical_karen_page.sql`; pure
  lifecycle tests; tenant-scoped API and
  database adapter tests; organizer Proposal list, creation, review, approval,
  send, copy, and withdrawal routes; opaque public Proposal review,
  alternative request, expiry, and terminal states; queued email delivery.
  Acceptance locks the Proposal and chosen option inside the existing
  hold-confirm transaction, then records the resulting booking atomically.
  An append-only Proposal activity stream records the decisions shown on the
  review screen.
  Existing one-off offers and direct booking remain unchanged.

#### E-05: Preparation, Outcome, and follow-up

- **Affected files:** schema, API, jobs, meeting detail, public preparation
- **Complexity:** Epic
- **Dependencies:** E-02, L-04
- **UX impact:** Differentiating
- **Engineering risk:** Medium to high
- **Before screenshot:** booking detail without readiness or outcome
- **After screenshot:** 3.14 and 3.15 plus next-step proposal
- **Ticket:** Keep completion under 20 seconds.

#### E-06: Recovery case

- **Affected files:** core recovery planning, schema, API, meeting routes, jobs, calendar update lifecycle
- **Complexity:** Epic
- **Dependencies:** E-01 through E-05, explicit time-off trigger
- **UX impact:** Differentiating
- **Engineering risk:** Very high
- **Before screenshot:** manual reschedule and reassignment
- **After screenshot:** recovery comparison per 3.16
- **Ticket:** First trigger is required-host explicit unavailability, approval required.

#### E-07: Relationship continuity and provider expansion

- **Affected files:** client history, project connection, provider interface, Microsoft/Zoom/Teams adapters
- **Complexity:** Epic
- **Dependencies:** E-01, provider abstraction, retention policy
- **UX impact:** Differentiating and adoption-critical
- **Engineering risk:** Very high
- **Before screenshot:** current client information inside individual bookings
- **After screenshot:** Client detail, Connection health, continuity reasons
- **Ticket:** Imported mappings require human confirmation.

#### E-08: Insights and policy-controlled agents

- **Affected files:** analytics views, provenance, audit, API/MCP policies, organizer Insights
- **Complexity:** Epic
- **Dependencies:** sufficient Engagement, outcome, and recovery data
- **UX impact:** Long-term differentiator
- **Engineering risk:** High
- **Before screenshot:** generic Analytics
- **After screenshot:** findings-led Insights per 3.18
- **Ticket:** No causal claim without evidence; no external mutation outside policy.

## 5. Quick-win implementation summary

Changed files:

- `web/src/pages/sign-in-page.tsx`
- `web/src/pages/dashboard-page.tsx`
- `web/src/pages/booking-page.tsx`
- `web/src/pages/poll-page.tsx`
- `web/src/pages/cancel-page.tsx`
- `web/src/pages/reschedule-page.tsx`
- `web/src/pages/routing-form-page.tsx`
- `web/src/pages/signup-sheet-page.tsx`
- `web/src/pages/public-booking-page.tsx`

No APIs, data models, business rules, routes, styling system, or dependencies changed.

## 6. Self review

### Changes retained

1. **Sign-in clarification:** directly reduces first-use ambiguity and matches actual account behavior.
2. **Truthful availability shortcut:** removes deceptive interaction without pretending the missing mobile drawer is solved.
3. **Error alerts:** provides measurable assistive-technology improvement with no visual churn.
4. **Pressed states:** exposes selection already represented visually.
5. **Native required and button types:** corrects browser semantics without affecting behavior.
6. **Linked-card focus:** reuses the established focus ring and makes keyboard navigation visible.

### Changes deliberately not made

- No Home copy change. Renaming “Good day” without delivering an action queue would be cosmetic.
- No global button-height change. It needs responsive screenshots across dense screens.
- No card, radius, shadow, spacing, type, or color edits.
- No dashboard navigation restructuring before route-backed architecture.
- No organizer sub-form error sweep beyond the global error because alert semantics need state-by-state review.
- No accessible dialog patch that adds Escape without a complete focus contract.
- No terminology replacement from Event types to Conversations before Engagement exists.
- No legacy capability removal or demotion.

### Risk review

- `aria-pressed` reflects existing state and does not change clicks.
- `role="alert"` is applied only to dynamic errors selected by an `error` state.
- Required attributes do not alter the current button click path because these inputs are not inside a native submit form; they improve semantics now and support future form conversion.
- The mobile shortcut still opens Availability exactly as before.
- The sign-in copy states actual behavior already implemented by authentication.

### Measurable result

- Eight public or global error locations now expose alert semantics.
- Duration and poll selection expose programmatic state.
- Required public sign-up fields expose native required semantics.
- One misleading mobile action is now accurately named.
- Every custom booking-page event link has a visible keyboard focus ring.
- First-time account creation is stated before OAuth.

## 7. Verification and evidence

Commands:

```sh
nix shell nixpkgs#bun --command bun run typecheck
nix shell nixpkgs#bun --command bun run lint
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:5434/test \
  nix shell nixpkgs#bun --command bun run verify
```

Result: `VERIFY PASS`, 506 tests passed, 0 failed. TypeScript and ESLint passed as part of the same gate.

Visual evidence:

- Before: `docs/screenshots/migration-plan/qw-sign-in-before.png`
- After: `docs/screenshots/migration-plan/qw-sign-in-after.png`

Semantic-only tickets intentionally preserve pixels. Their acceptance evidence is the accessibility tree or DOM state specified in each ticket.

## 8. Recommended next release

Do not begin Engagement implementation immediately.

The next release should contain:

1. S-01 through S-07, excluding S-08;
2. M-01 accessible booking drawer;
3. L-01 route-backed wrappers that preserve current screens;
4. L-02 mobile navigation only after route wrappers exist.

This provides a significant improvement in clarity, accessibility, mobile navigation, and durable location before introducing a new product object.

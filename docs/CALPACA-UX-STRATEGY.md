# Calpaca UX Strategy

Version: 1.0  
Date: July 23, 2026  
Status: Product direction, not an implementation specification

## The product decision

Calpaca should not become a larger scheduling dashboard.

It should become a scheduling control plane that helps an operator answer three questions:

1. **What can people book?**
2. **What needs my attention now?**
3. **Why did scheduling not work as expected?**

Every organizer capability should support one of three operating loops:

- **Publish supply:** define who can meet, when they can meet, what can be booked, and where it is published.
- **Resolve demand:** manage bookings, group decisions, registrations, changes, and follow-up.
- **Repair exceptions:** identify broken calendars, unavailable times, failed routing, exhausted capacity, and configuration conflicts.

The public product has a different job. It should help an invitee make one confident decision with minimal effort. The organizer interface and public scheduling surfaces share data and brand, but they should not share the same interaction model.

This strategy treats “inventory” as Calpaca's bookable supply: event types, hosts, capacity, schedules, meeting locations, booking pages, and one-off availability. Calpaca does not currently provide payment processing or full customer relationship management. Those future workflows are addressed explicitly without pretending they already exist.

---

## Phase 1: Root causes

### The design philosophy that created the current product

The current product was built from a **feature-first admin philosophy**:

1. Add a capability.
2. Give it a tab.
3. Put its data in a card.
4. Put creation and editing in an inline form.
5. Stack new controls below existing controls.
6. Make the layout collapse on mobile.

That philosophy is efficient for shipping isolated features. It becomes destructive once features interact.

Calpaca now has event types, schedules, hosts, teams, calendars, booking pages, routing, polls, sign-up sheets, one-off offers, analytics, API tokens, themes, embeds, and diagnostics. These are not independent settings. They are a connected scheduling system. The interface still presents them as independent forms.

The result is not primarily a visual problem. It is a product-model problem.

### The incorrect product assumptions

The current interface assumes:

- A feature deserves a top-level destination because it exists.
- A dashboard should summarize the product whether or not the summary helps users act.
- Configuration is a collection of forms rather than a sequence of decisions.
- Users understand Calpaca's internal nouns and relationships.
- Desktop information structures can be stacked to create mobile experiences.
- Disabled controls are an adequate explanation of incomplete work.
- More visible settings create more control.
- A booking object can be understood without its relationships to host, calendar, location, page, and attendee.
- Errors belong on a troubleshooting page rather than at the point of failure.
- The organizer remembers where settings live.
- Every user needs the same navigation regardless of role, frequency, or setup state.
- New capabilities can be added without reconsidering the application's information architecture.

Those assumptions are now false.

### The ten highest-leverage UX problems

#### 1. The product is organized by features, not operator jobs

**Why it exists:** each capability was added as a navigation tab and local component.

**Root cause:** Calpaca has no canonical model of the organizer's work.

**Cascading symptoms:**

- thirteen dashboard destinations
- “Profile & API” as one page
- one-off offers hidden under setup
- polls and sign-up sheets separated from bookings despite all being demand-resolution tools
- booking pages embedded inside Scheduling
- Availability troubleshooter treated as a destination rather than recovery behavior
- inconsistent terminology between public and organizer surfaces

**Strategic correction:** organize around Publish, Meetings, Coordinate, and Workspace, with contextual exception handling. Features become tools inside workflows.

#### 2. Objects have no durable place

**Why it exists:** the organizer is one `/dashboard` route controlled by component state.

**Root cause:** screens were treated as render states, not product locations.

**Cascading symptoms:**

- refresh loses location
- Back and Forward are unreliable
- support cannot share exact links
- users cannot bookmark an event type or poll
- mobile navigation must simulate application state
- editors remain inline because no object-detail route exists
- drawers carry too much responsibility

**Strategic correction:** every durable object and meaningful view receives a durable URL. Route state is product state.

#### 3. Creation, editing, browsing, and monitoring are collapsed together

**Why it exists:** inline forms avoided creating separate page architecture.

**Root cause:** fewer routes were mistaken for fewer steps.

**Cascading symptoms:**

- enormous Scheduling and Polls screens
- Save actions far from edited fields
- list context disappears during editing
- repeated empty forms above or beside existing objects
- accidental data loss
- no stable preview or review state
- difficult mobile use

**Strategic correction:** separate collection, creation, detail, and editing modes while preserving context. Fewer concepts per screen matter more than fewer URLs.

#### 4. Configuration exposes the data model instead of guiding decisions

**Why it exists:** forms map closely to API payloads and database entities.

**Root cause:** technical completeness was prioritized over decision clarity.

**Cascading symptoms:**

- event type forms expose every option at once
- routing builders use keys, clauses, and operators
- calendars do not clearly separate conflict checking from event creation
- schedule configuration is repetitive
- booking pages require users to infer their relationship to event types
- location rules are harder to understand than the meeting outcome

**Strategic correction:** ask one meaningful decision at a time, reveal advanced behavior when relevant, and preview the operational consequence.

#### 5. The product has no shared lifecycle language

**Why it exists:** each feature invented its own status treatment.

**Root cause:** Calpaca models objects but not their common lifecycle.

**Cascading symptoms:**

- active, draft, closed, finalized, expired, used, revoked, cancelled, disconnected, full, and unavailable appear inconsistently
- destructive actions vary by feature
- users cannot predict what can be reopened or recovered
- empty and terminal states become dead ends
- analytics cannot compare lifecycle outcomes cleanly

**Strategic correction:** define shared lifecycle concepts: Draft, Published, Attention needed, Completed, Archived. Preserve domain-specific detail beneath them.

#### 6. Exceptions are separated from the work that caused them

**Why it exists:** troubleshooting was implemented as a standalone tool.

**Root cause:** error diagnosis was treated as an expert feature instead of a normal part of operations.

**Cascading symptoms:**

- users see unavailable times without an explanation
- calendar failures require navigation to another page
- form errors appear as summaries rather than corrections at the source
- event configuration and diagnostic results are disconnected
- support knowledge is required for ordinary recovery

**Strategic correction:** explain and repair exceptions in context. The standalone troubleshooter remains only as a power tool.

#### 7. Home summarizes data instead of directing work

**Why it exists:** the default assumption was that SaaS products need a dashboard.

**Root cause:** overview was confused with usefulness.

**Cascading symptoms:**

- generic greeting
- metric tiles without decisions
- duplicate analytics
- setup problems hidden elsewhere
- polls ready to finalize do not lead
- upcoming meetings compete with vanity numbers

**Strategic correction:** Home becomes an inbox for exceptions and time-sensitive work. If there is nothing to do, it gets out of the way.

#### 8. Mobile is a breakpoint strategy, not an operating strategy

**Why it exists:** desktop components were made to wrap, stack, or scroll.

**Root cause:** the team did not define which organizer jobs matter on a phone.

**Cascading symptoms:**

- six-item bottom navigation
- hidden setup destinations
- long forms
- horizontal result matrices
- sticky panels competing with keyboards
- small controls
- desktop information density without desktop space

**Strategic correction:** mobile optimizes monitoring, exception repair, link sharing, booking management, and quick creation. Complex system configuration may be possible, but it should not dictate the mobile shell.

#### 9. The product does not distinguish frequent actions from rare settings

**Why it exists:** navigation reflects feature inventory rather than use frequency.

**Root cause:** all capabilities were given equal visual and navigational weight.

**Cascading symptoms:**

- Calendars and Bookings appear as peers
- API tokens compete with Profile
- one-off offers are buried
- workspace administration occupies everyday navigation
- destructive or advanced controls remain visible during simple tasks

**Strategic correction:** frequent work stays close. Rare configuration moves into contextual setup and workspace administration.

#### 10. Trust is treated as copy, not system behavior

**Why it exists:** trust messaging was added after flows were built.

**Root cause:** the product does not consistently expose consequences, ownership, saved state, permission scope, or recovery.

**Cascading symptoms:**

- generic sign-in language
- unclear Google permissions
- cancellation without meeting identity
- rescheduling without enough context
- ambiguous destructive icons
- hidden save state
- one-off links without lifecycle clarity
- custom domains and hosted ownership not sufficiently explained

**Strategic correction:** every consequential action states what will happen, to whom, when it takes effect, and how to recover.

### The root cause behind the root causes

Calpaca lacks a single interaction architecture.

It has a data architecture, an API architecture, and a growing feature roadmap. It does not yet have a stable answer to:

- what constitutes a primary object
- what constitutes a view
- what belongs in navigation
- what belongs in context
- when editing is inline, focused, or full-page
- how objects share lifecycle and status
- how mobile work differs from desktop work
- how exceptions interrupt ordinary workflows

Until those decisions are made, component refinement will produce cleaner inconsistency.

---

## Phase 2: Reimagining Calpaca

### The product should be object-centered and workflow-led

Calpaca has five primary organizer objects:

1. **Meeting type:** what an invitee can book.
2. **Booking page:** how meeting types are published and grouped.
3. **Meeting:** a scheduled outcome, regardless of whether it began as a direct booking, poll, sign-up, or one-off offer.
4. **Coordination:** a temporary process for reaching a meeting outcome, such as a poll or sign-up sheet.
5. **Workspace:** people, teams, calendars, schedules, routing, brand, domains, integrations, and access.

Everything else is either:

- a view of those objects
- a reusable input to those objects
- an action on those objects
- a report derived from those objects
- an exception that prevents those objects from working

This model sharply reduces navigation pressure.

### The proposed product structure

#### Home

Home is not a dashboard. It is a work queue.

It contains only:

- issues blocking bookings
- polls ready to finalize
- sessions approaching capacity
- meetings needing action
- calendar or integration failures
- onboarding tasks not yet completed

If no action is required, Home shows the next few meetings and a compact “Everything is working” state.

#### Scheduling

Scheduling owns bookable supply:

- Meeting types
- Booking pages
- One-off offers

Availability, hosts, teams, locations, routing, themes, and calendars appear contextually in the meeting-type workflow. Their reusable definitions remain under Workspace.

#### Meetings

Meetings owns scheduled outcomes:

- Upcoming
- Past
- Cancelled
- No-show or completed outcomes

It supports search, filters, saved views, bulk actions where appropriate, and durable meeting details.

#### Coordinate

Coordinate owns group decision processes:

- Polls
- Sign-up sheets

Both share a common lifecycle: Draft, Collecting responses, Ready to decide, Finalized, Closed. Their list and detail patterns should be consistent even though their public interactions differ.

#### Insights

Insights answers operational questions:

- Are people successfully booking?
- Which meeting types are used?
- Where are bookings failing?
- How are meetings distributed across hosts?
- What is the completion or no-show outcome?

It is not a collection of metric cards.

#### Workspace

Workspace owns reusable system configuration:

- People
- Teams
- Availability schedules
- Calendars
- Routing
- Brand and domains
- Integrations and API
- Roles and access
- Billing when hosted billing exists

Workspace is not in the primary daily workflow on mobile.

### Should navigation exist where it currently does?

No.

The current sidebar is a directory of features. Replace it with five operational destinations and one workspace area:

- Home
- Scheduling
- Meetings
- Coordinate
- Insights
- Workspace

Inside Workspace, use a settings index and local section navigation. Do not duplicate every settings page in the global sidebar.

### Should dashboards exist?

Only if they answer a recurring decision.

Calpaca needs:

- a work queue on Home
- an operational report area in Insights

It does not need a generic dashboard of tiles. If a number does not prompt a decision, it should not occupy the home screen.

### Should tables become workflows?

Some should. Some should remain tables.

Use tables or dense lists when the task is:

- searching
- comparing similar records
- filtering
- selecting multiple records
- monitoring status

Use workflows when the task is:

- creating a meeting type
- resolving a poll
- fixing calendar availability
- connecting an integration
- onboarding a workspace
- configuring payments

The mistake is not using tables. The mistake is using a table when the user must make a sequence of dependent decisions, or using cards when the user must compare many records.

### Should multiple screens become one?

Merge screens when they represent the same decision:

- People and Teams belong in one Workspace membership domain, with separate list views.
- Profile and authentication belong in Account.
- Workspace identity, branding, custom domain, and public defaults belong in Brand and publishing.
- Availability schedules and calendar conflict behavior should meet inside a meeting type's availability step, while remaining separately reusable.
- Poll and sign-up sheet lists belong in Coordinate.

Do not merge distinct modes merely to reduce routes:

- Meeting-type list and meeting-type editor should be separate.
- Poll list, poll creation, and poll resolution should be separate modes.
- Meeting list and full meeting detail should have durable locations.
- Workspace settings should not share one giant scrolling form.

### Should forms become progressive?

Yes, when later choices depend on earlier choices.

A meeting type should be created through:

1. Purpose and duration
2. Hosts and capacity
3. Availability
4. Location
5. Invitee details
6. Publish and share

Advanced settings should be available without blocking publication:

- buffers
- notice and booking window
- routing
- branding and layout
- custom questions
- embed options
- webhooks

This is not a wizard that traps users. It is a staged editor with visible sections, saved progress, and direct navigation after the initial publishable minimum exists.

### Should data be summarized differently?

Yes. Summaries should answer decisions:

- Replace “12 polls” with “2 polls ready to finalize.”
- Replace “42 bookings” with “5 meetings today, 1 needs attention.”
- Replace “calendar connected” with “Availability protected by 3 calendars, new events added to Work.”
- Replace “one-off active” with “Link expires Friday, not yet claimed.”
- Replace poll response matrices on mobile with “Tuesday 10:30 works for 7 of 8; one person unavailable.”
- Replace generic host balance metrics with “Kai received 64% of round-robin assignments this month; expected range 45% to 55%.”

---

## Phase 3: Ruthless simplification

### Screen inventory after simplification

This is a conceptual screen model, not a route specification.

| Current area | Decision | Proposed destination |
| --- | --- | --- |
| Home dashboard | Replace | Home work queue |
| Scheduling tab | Split | Meeting types list and focused editor |
| Booking pages inside Scheduling | Promote within domain | Booking pages list and focused editor |
| One-off offers under setup | Move | Scheduling, One-off offers |
| Bookings | Keep and strengthen | Meetings list and meeting detail |
| Polls | Move and split | Coordinate list, poll builder, poll detail |
| Sign-up sheets | Move and split | Coordinate list, sheet builder, sheet detail |
| Analytics | Reframe | Insights |
| Profile & API | Eliminate | Account profile and Workspace integrations |
| Availability | Keep as reusable setting | Workspace availability; contextual inside meeting types |
| Routing | Keep as reusable setting | Workspace routing; contextual inside meeting types |
| People & teams | Split within one domain | Workspace people and Workspace teams |
| Calendars | Keep | Workspace calendars; contextual health and repair |
| Troubleshooter | Remove from primary navigation | Contextual diagnostics plus advanced Workspace tool |
| Custom booking-page public route | Keep | Public event directory |
| Cancel and reschedule utility cards | Reframe | Meeting-specific public actions |
| Sign in | Keep | Sign in or create account |

### What should disappear

- Generic Home metrics
- “Good day”
- “Profile & API” as a combined concept
- Troubleshooter as a primary destination
- inline create forms above object lists
- repeated embed panels inside editors
- public titles derived from slugs
- generic empty-state cards
- separate visual patterns for every lifecycle
- fake interactive marketing previews
- duplicated setup navigation on mobile

### What should become contextual

- Availability diagnosis from an unavailable slot
- Calendar repair from a meeting type or health warning
- Routing selection from a meeting type
- Theme preview from publishing
- Embed code from Share
- Team selection from host assignment
- Payment configuration from a paid meeting type
- Customer history from a meeting detail
- API events and webhook failures from the affected object

### What should become a drawer

Drawers should preserve list context for fast inspection, not contain complete editing workflows.

Good drawer uses:

- quick meeting preview from a list
- invitee history summary
- calendar-health explanation
- poll participant response detail

Bad drawer uses:

- full meeting-type configuration
- role administration
- complex routing rules
- destructive workspace settings

Every drawer-worthy object must still have a durable full-page URL.

### What should become inline editing

Inline editing is appropriate when:

- the value is obvious
- the consequence is local
- validation is simple
- the user benefits from comparing surrounding records

Use it for:

- meeting type active state
- display order
- event color if retained
- team member role with adequate authorization
- schedule name
- booking outcome

Do not use it for:

- calendar permissions
- routing logic
- payment policy
- capacity rules
- cancellation behavior
- destructive changes

---

## Phase 4: Major workflow strategy

### Workflow 1: Onboarding

#### User goal

Publish one trustworthy booking link and understand how Calpaca protects the calendar.

#### Current friction

- Google sign-in does not explain account creation or permissions.
- Users land in a feature-heavy organizer.
- Profile, calendars, availability, and meeting types are separate destinations.
- Setup completion is not expressed as an operational state.
- The user can configure advanced details before seeing a working result.
- Hosted versus self-hosted differences are not part of the product orientation.

#### Proposed workflow

1. Sign in or create an account.
2. Confirm identity, timezone, and workspace name.
3. Connect Google Calendar, then explicitly choose:
   - calendars that block availability
   - calendar that receives new events
4. Choose a starting goal:
   - Individual booking link
   - Team booking link
   - Group poll
   - Sign-up sheet
5. Create the minimum publishable object.
6. Preview it as an invitee.
7. Publish and copy the link.
8. Return to Home, which confirms protection and shows the next optional improvement.

#### Steps collapsed

- Profile and workspace basics are collected together once.
- Calendar connection and availability protection are explained together.
- The initial schedule defaults from connected-calendar context and timezone.
- A starter meeting type can inherit sensible defaults without exposing every setting.

#### Dead ends removed

- A failed calendar connection offers retry, alternate account, and continue-without-calendar paths.
- An unpublishable meeting type points directly to the missing decision.
- A published link always has Preview and Copy actions.

#### Success measure

Median time from first sign-in to a tested public link under five minutes.

### Workflow 2: Creating inventory

“Inventory” in Calpaca means bookable supply.

#### User goal

Create a bookable offering without learning the full Calpaca data model.

#### Current friction

- Meeting type creation exposes every field.
- Hosts, teams, schedules, calendars, locations, themes, questions, and pages appear as separate concepts.
- Users duplicate data across similar meeting types.
- The relationship between meeting type and booking page is not obvious.
- Save and validation are distant from the field in question.

#### Proposed workflow

1. Start from a template or duplicate an existing meeting type.
2. Define purpose and duration.
3. Choose who hosts and how capacity works.
4. Choose when it can be booked using a named schedule or a simple inline pattern.
5. Choose meeting location.
6. Preview.
7. Publish to a direct link and optionally add it to a booking page.

After publication, advanced sections become independently editable with persistent saved state.

#### Duplicate entry removed

- Workspace defaults supply timezone, cancellation rules, brand, default calendar, and standard availability.
- Templates preserve common questions, buffers, and locations.
- Booking pages select meeting types rather than duplicate their data.
- Host teams inherit routing and availability rules unless overridden.

#### Unclear decisions corrected

- “Seats per time” becomes “How many invitees can join each session?”
- “Mode” becomes the actual host-assignment choice.
- “Schedule” previews the effective days and hours.
- “Location” states what the invitee experiences.

#### Success measure

A user can publish a second meeting type in less than two minutes without documentation.

### Workflow 3: Connecting integrations

#### User goal

Connect a service, understand the access granted, verify health, and repair failures.

#### Current friction

- Calendar connection, conflict selection, write destination, Meet creation, domain setup, API tokens, and future webhooks are fragmented.
- Connection state is mostly binary.
- Users cannot see last successful activity or permission health.
- Troubleshooting requires moving to another tool.

#### Proposed workflow

Workspace Integrations shows each connection as:

- purpose
- account identity
- capabilities granted
- current health
- last successful activity
- objects affected
- reconnect or disconnect

Calendar setup is task-based:

1. Connect account.
2. Choose conflict calendars.
3. Choose event calendar.
4. Test connection.
5. Show meeting types affected.

Domain verification, API tokens, webhooks, and future payment connections use the same health and ownership model.

#### Trust requirement

Every integration states what Calpaca reads, what it writes, where credentials are stored, and what stops working after disconnection.

#### Success measure

Users can identify and repair a broken integration from the warning itself without opening documentation.

### Workflow 4: Booking management

#### User goal

Find a meeting, understand its state, change it safely, and follow up.

#### Current friction

- Meeting detail is a transient drawer.
- Search, filtering, status, and actions are not organized around frequent work.
- Cancel and reschedule public pages omit full meeting identity.
- Booking origins such as poll, sign-up, one-off, and direct booking are fragmented.
- Consequences of changes are not consistently explained.

#### Proposed workflow

Meetings is the canonical outcome ledger.

Default views:

- Today
- Upcoming
- Needs attention
- Past
- Cancelled

Each meeting has:

- title
- local date and time
- host and invitees
- location
- origin
- status
- communication state
- change history
- related customer history

Common actions are available from the list when safe. Consequential actions open the meeting context.

#### Steps collapsed

- Poll finalization creates and links the resulting meeting.
- Sign-up sessions appear as meetings with capacity and attendee detail.
- One-off claims become normal meetings with source history.
- Cancellation and rescheduling are actions on the same meeting object.

#### Success measure

An operator can locate and act on any meeting within ten seconds using search, filters, or saved views.

### Workflow 5: Customer management

Calpaca should not become a general CRM.

#### Actual user problem

Organizers need enough attendee context to avoid treating repeat invitees as strangers and to resolve scheduling issues.

#### Current gap

- Invitee details live inside individual bookings.
- Repeat history is difficult to see.
- Notes and custom answers are isolated.
- There is no clear consent or retention model for customer data.

#### Proposed scope

Introduce a lightweight **People history**, not a sales CRM:

- name and email
- previous and upcoming meetings
- cancellation and no-show history
- submitted booking answers
- workspace notes with clear permissions
- data export and deletion

Access it contextually from a meeting and through search. Do not create a top-level Customers destination until evidence shows frequent independent customer-management work.

#### What not to build

- deals
- pipelines
- campaigns
- lead scoring
- broad contact enrichment

Use integrations and webhooks for those jobs.

#### Success measure

From a meeting, an authorized organizer can understand relevant prior scheduling history without leaving Calpaca.

### Workflow 6: Reports

#### User goal

Answer an operational question and take action.

#### Current friction

- Reports are generic metrics.
- Definitions, comparison periods, and expected ranges are weak.
- Booking funnel behavior is not currently captured.
- Results are visually separated from the objects that explain them.

#### Proposed report model

Insights contains four reports:

1. **Demand:** bookings by meeting type, page, source, and period.
2. **Availability:** offered supply, unavailable requests where measurable, and schedule constraints.
3. **Outcomes:** completed, cancelled, rescheduled, and no-show meetings.
4. **Distribution:** host assignment and capacity utilization.

Every report states:

- date range
- definition
- comparison
- sample size
- important exception
- link to affected records

Do not claim conversion without page-view and attempt instrumentation.

#### Success measure

Each report supports at least one concrete operational decision and links to the records behind it.

### Workflow 7: Payments

Payments are a future capability and should not be designed as a generic integration toggle.

#### User goal

Charge for a meeting with confidence about confirmation, refunds, cancellation, taxes, and failure recovery.

#### Required product decisions before interface work

- Is payment required before a slot is reserved or before confirmation?
- What happens when payment succeeds but booking creation fails?
- Who owns refunds?
- Are partial deposits supported?
- How do cancellations and reschedules affect payment?
- What currency and tax behavior is supported?
- What appears on receipts and statements?
- How does self-hosted payment ownership differ from hosted?

#### Proposed workflow

Payments belong in two contexts:

- Workspace payment provider and policy
- Meeting-type price and cancellation behavior

A paid meeting preview must show:

- total due
- refund policy
- when the slot becomes reserved
- organizer identity
- payment provider

Payment state becomes part of the meeting lifecycle, not a separate ledger hidden from bookings.

#### Success measure

No user can reach a state where money moved but neither organizer nor invitee can understand whether a meeting exists.

### Workflow 8: Settings

#### User goal

Change reusable workspace behavior without navigating a maze.

#### Current friction

- settings are mixed with daily work
- personal and workspace settings are combined
- advanced capabilities occupy top-level navigation
- dependencies are hidden

#### Proposed structure

**Account**

- Profile
- Appearance
- Security and sessions
- Personal API tokens

**Workspace**

- General
- Brand and publishing
- People
- Teams and roles
- Availability
- Calendars
- Routing
- Integrations
- Domains
- Billing
- Data and retention

Each setting shows what objects inherit it and where overrides exist.

#### Success measure

A user can predict whether a change affects themselves, the workspace, or public invitees before saving.

### Workflow 9: Administration

#### User goal

Operate a workspace safely at scale.

#### Current friction

- administration is interwoven with ordinary use
- admin visibility and membership rules have required corrective iterations
- invitations, roles, teams, and access lack one coherent model
- destructive consequences are under-explained

#### Proposed workflow

Administration provides:

- people and invitation status
- roles and capabilities
- team membership
- workspace ownership
- audit history
- billing seats when applicable
- data export and deletion

Permissions are explained in capability language, not just role names.

Examples:

- “Can publish meeting types”
- “Can manage workspace calendars”
- “Can invite and remove people”
- “Can view all teams”

#### Success measure

An administrator can answer who has access to what and why without testing the interface as that person.

---

## Phase 5: Best-in-class interaction benchmarks

Calpaca should borrow operating principles, not appearance.

### Linear: consistent actions and recoverability

Linear exposes the same action through visible controls, context menus, keyboard shortcuts, and a command menu. It also supports undo for many changes and preserves drafts during creation.

**Apply to Calpaca:**

- one consistent action model across lists and details
- command search for people, meeting types, bookings, and actions
- undo for reversible organizer changes
- preserved drafts for meeting types, polls, and sign-up sheets
- predictable Escape and Back behavior

**Do not copy:** keyboard density that excludes occasional users.

### Notion: universal findability and flexible detail depth

Notion combines workspace search, recent items, saved views, and the ability to open records as a side peek or full page. The same data can be viewed differently depending on the task.

**Apply to Calpaca:**

- global search with recent objects
- saved meeting and coordination views
- quick preview from lists with durable full pages
- calendar, list, and compact result views only where each answers a real task

**Do not copy:** unrestricted structural flexibility. Scheduling needs stronger guardrails.

### Stripe Dashboard: object clarity, health, and diagnostic depth

Stripe treats transactions and integration events as durable objects. Its Workbench brings logs, errors, health, and related activity into a filterable diagnostic environment with shareable views.

**Apply to Calpaca:**

- durable meeting and integration objects
- health states with cause and remedy
- related event history
- shareable diagnostic links
- clear test versus live behavior if payments are introduced

**Do not copy:** developer terminology in ordinary organizer workflows.

### Shopify Admin: list productivity

Shopify uses search, filters, saved views, selection, and contextual bulk actions to support repeated operational work.

**Apply to Calpaca:**

- saved views for Meetings and Coordinate
- bulk actions only for real repeated tasks
- contextual action bars after selection
- consistent list behavior across object types

**Do not copy:** an enormous top-level feature inventory.

### GitHub: durable URLs and scoped navigation

GitHub makes repositories, issues, views, filters, and settings linkable. Its command palette is scoped to the current organization or repository, and saved views encode recurring work.

**Apply to Calpaca:**

- linkable objects, views, and filters
- workspace-scoped search and commands
- location-aware actions
- settings attached to the correct scope

**Do not copy:** deeply nested navigation created by years of platform expansion.

### Figma: selection drives context

Figma's interface changes its available controls according to the selected object. Navigation, canvas, layers, and properties have distinct responsibilities.

**Apply to Calpaca:**

- list selection reveals relevant actions
- object context determines available settings
- advanced properties do not occupy the primary workflow until the relevant object is selected
- editing mode is visibly distinct from browsing mode

**Do not copy:** persistent inspector density for occasional scheduling users.

### Ramp: exception-driven operations

Ramp organizes financial review around what needs approval, what violates policy, and what information is missing. The system prioritizes exceptions over raw transaction volume.

**Apply to Calpaca:**

- Home as an exception queue
- “Needs attention” as a first-class shared state
- clear reason and requested correction
- saved operational views

**Do not copy:** approval mechanics where scheduling does not require approval.

### Mercury: confidence at consequential moments

Mercury's strongest product lesson is that actions involving money or access should make identity, amount, destination, timing, and status unmistakable.

**Apply to Calpaca:**

- meeting identity on cancel and reschedule
- explicit invitee and host impact
- clear payment and refund state when payments arrive
- strong completion receipts and history

**Do not copy:** financial-product solemnity across low-risk scheduling actions.

### Vercel: resource hierarchy and inspectability

Vercel organizes work as team, project, deployment, and resource. A deployment has status, source, environment, logs, and actions in one inspectable place.

**Apply to Calpaca:**

- Workspace, meeting type, publication surface, and booking relationships
- preview versus published state
- status plus change history
- related diagnostic information on the affected object

**Do not copy:** project-centric terminology that does not map to scheduling.

### Airtable: purpose-specific interfaces over shared data

Airtable distinguishes record lists, record review, forms, dashboards, and details. It supports inline editing for simple work and focused detail for complex work.

**Apply to Calpaca:**

- choose list, builder, detail, report, or diagnostic layout based on the task
- allow safe inline changes while preserving full details
- use one shared data model without forcing one shared screen layout

**Do not copy:** configurability that requires users to design their own scheduling application.

### Benchmark conclusion

The common lesson is not minimalism. It is **stable object models, durable locations, contextual actions, recoverability, and task-specific views**.

Calpaca should not imitate the visual style of any benchmark. It should match their confidence about what an object is, where it lives, what can happen to it, and how a user recovers.

---

## Phase 6: Product philosophy

### Current product philosophy

“Expose every scheduling capability in one organizer workspace.”

This optimizes feature availability. It does not optimize operation.

### Proposed product philosophy

“Turn scheduling intent into a reliable meeting, and make every exception understandable.”

This prioritizes outcome, confidence, and repair.

### Design principles

#### 1. Organize around outcomes

Users publish availability, reach scheduling decisions, and hold meetings. Features serve those outcomes.

#### 2. Context before control

Before showing an action, show the object, state, and consequence that make the action understandable.

#### 3. Progressive power

Make the common path short. Keep advanced capability discoverable and available without placing it in front of every user.

#### 4. One object, one durable home

Every meeting type, booking page, meeting, poll, sheet, person, team, schedule, and integration has a stable location.

#### 5. Exceptions explain themselves

Errors appear where they matter, state what blocked the outcome, and provide the most direct repair.

#### 6. Preserve work

Drafts, unsaved changes, filters, selection, and navigation context survive ordinary movement. Reversible actions offer undo.

#### 7. Public flows ask one question at a time

Invitees should never need to understand Calpaca's configuration model.

#### 8. Mobile serves mobile work

The phone experience prioritizes monitoring, sharing, responding, and urgent repair. It does not reproduce every desktop configuration surface at equal density.

#### 9. Trust is observable

Users can see what is connected, what is saved, what will happen, who is affected, and how to recover.

#### 10. Add no destination without removing pressure elsewhere

A new feature does not automatically earn a navigation item. It must fit an existing object, workflow, or workspace domain.

### Navigation philosophy

- Navigation represents stable work domains, not individual capabilities.
- Every destination has a URL.
- Current location is always visible.
- Workspace scope is explicit.
- Search finds objects and actions.
- Recent and saved views reduce repeated navigation.
- Mobile exposes four primary choices at most, with the rest under More.
- Contextual links outperform instructions that tell users to navigate elsewhere.

### Mobile philosophy

- Design the top five mobile jobs explicitly:
  1. see today's meetings
  2. respond to or finalize coordination
  3. share a booking link
  4. repair a booking blocker
  5. manage a meeting change
- Never require horizontal panning to understand primary information.
- Use summaries before detail.
- Account for the keyboard, safe areas, and fixed navigation.
- Maintain 44px minimum targets.
- Complex configuration uses staged full-screen flows, not compressed desktop forms.

### Information hierarchy

Every organizer screen should answer in this order:

1. **Where am I?**
2. **What object or view am I working with?**
3. **What state is it in?**
4. **What decision or action matters now?**
5. **What supporting detail explains that decision?**
6. **What advanced controls are available if needed?**

Public screens answer:

1. Who is this with?
2. What is being scheduled?
3. What decision is required?
4. What time, timezone, location, capacity, or price applies?
5. What happens after confirmation?

### Workflow philosophy

- Use a list for finding and comparing.
- Use a focused editor for dependent configuration.
- Use a detail page for history and consequential actions.
- Use a drawer for quick inspection only.
- Use inline editing for obvious, local, reversible changes.
- Use a workflow for decisions with dependencies or meaningful failure states.
- Use background defaults to remove work, then make inherited behavior visible.
- End every workflow with a clear result and next action.

### Component philosophy

Components encode interaction contracts, not just styles.

A shared component must define:

- semantic role
- focus behavior
- keyboard behavior
- loading state
- disabled state
- error state
- mobile target behavior
- destructive behavior
- content limits
- when not to use it

Calpaca needs fewer generic containers and more domain patterns:

- object list
- status and lifecycle
- saved view
- effective availability summary
- connection health
- publish state
- meeting identity
- ranked candidate result
- exception and repair
- dirty and saved state

### Content philosophy

- Name the user's object, not Calpaca's internal mechanism.
- Use verbs that describe the result.
- State consequences before consequential actions.
- Explain recovery in the error itself.
- Avoid generic greetings and SaaS filler.
- Do not convert slugs into public titles.
- Avoid “AI” unless the product explains what was inferred, from what inputs, and what the user can change.
- Use one term consistently:
  - Meeting type for a reusable bookable offering
  - Booking page for a published collection
  - Meeting for a scheduled outcome
  - Poll for group availability voting
  - Sign-up sheet for fixed-capacity enrollment
  - Availability schedule for reusable hours

### Accessibility philosophy

Accessibility is part of the interaction architecture.

- Native semantics first.
- Keyboard behavior is specified with every workflow.
- Focus follows task transitions.
- Status changes are announced without noise.
- Color reinforces meaning but never carries it alone.
- Target size is a mobile requirement, not a component preference.
- Reduced motion preserves comprehension.
- Errors identify fields and recovery.
- Dialogs, drawers, menus, and command search use proven focus management.
- Complex visual summaries have equivalent structured text.
- Accessibility acceptance criteria are required before a workflow is complete.

---

## Phase 7: Master roadmap

Ranking reflects user impact. Foundation items unlock later work, but rank is still based on how broadly they improve the product.

### Foundation

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Define canonical organizer objects, relationships, and shared lifecycle | Very high | Every future screen and feature fits a stable model. |
| 2 | Replace dashboard state with route-backed application architecture | Very high | Durable navigation, deep links, Back, refresh, support links, and focused editors become possible. |
| 3 | Establish collection, detail, editor, workflow, and diagnostic page patterns | Very high | Features stop inventing their own layout and interaction model. |
| 4 | Create shared save, draft, error, success, undo, and destructive-action behavior | Very high | Users gain confidence and stop losing work. |
| 5 | Define workspace inheritance and overrides | High | Defaults reduce configuration without hiding effective behavior. |
| 6 | Add product analytics for onboarding, booking attempts, failures, and workflow completion | High | Future design decisions can be based on observed friction. |

### Navigation

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Replace thirteen-feature navigation with Home, Scheduling, Meetings, Coordinate, Insights, and Workspace | Very high | The application matches operator jobs. |
| 2 | Build accessible mobile navigation with four primary destinations and More | Very high | All mobile destinations are discoverable without crowding. |
| 3 | Add global search for objects and actions | High | Users can reach known objects without navigating the hierarchy. |
| 4 | Add recent objects and saved views | High | Repeated operations become faster. |
| 5 | Add scope-aware breadcrumbs and back behavior | High | Editors and details preserve context. |
| 6 | Contextually link diagnostics, calendars, routing, teams, and publishing | High | Users repair or configure without hunting through settings. |

### Workflows

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Redesign first-run onboarding around publishing one tested booking link | Very high | Faster activation and clearer trust. |
| 2 | Rebuild meeting-type creation as a minimum publishable flow plus progressive settings | Very high | Calpaca's core supply workflow becomes understandable and fast. |
| 3 | Unify scheduled outcomes in Meetings | Very high | Direct bookings, polls, sign-ups, and one-off links resolve into one operational model. |
| 4 | Rebuild Coordinate around shared list and lifecycle patterns | High | Polls and sign-up sheets become easier to create, monitor, and resolve. |
| 5 | Make calendar and integration health contextual and repairable | High | Fewer booking failures and less support dependence. |
| 6 | Replace Home metrics with an exception and action queue | High | Organizers see what matters now. |
| 7 | Add meeting identity and consequence clarity to cancel and reschedule | High | Public trust improves at high-risk moments. |
| 8 | Introduce lightweight attendee history from meeting context | Medium | Repeat invitee context improves without creating a CRM. |
| 9 | Rebuild Insights around demand, availability, outcomes, and distribution | Medium | Reports support decisions rather than decoration. |
| 10 | Define payment state machine before building payment UI | Future high | Prevents financial ambiguity and broken booking states. |

### Components

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Accessible dialog, drawer, menu, and command-search primitives | Very high | Focus and keyboard behavior become reliable. |
| 2 | Domain status and lifecycle component | High | State becomes consistent across objects. |
| 3 | Form field, validation, and error-summary contract | High | Recovery becomes visible and accessible. |
| 4 | Dirty, saving, saved, and draft state pattern | High | Long editors become trustworthy. |
| 5 | Object list with search, filters, selection, saved views, and mobile adaptation | High | Management screens become fast and consistent. |
| 6 | Connection-health and repair pattern | High | Integrations become understandable. |
| 7 | Meeting identity summary | High | Booking, cancel, reschedule, and details share trusted context. |
| 8 | Exception and repair pattern | High | Troubleshooting moves into ordinary work. |
| 9 | Publish and share pattern | Medium | Links, preview, booking pages, and embeds become one coherent action. |
| 10 | Remove generic card dependency from page structure | Medium | Hierarchy comes from the task, not borders. |

### Mobile

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Define and test the five primary mobile jobs | Very high | Mobile decisions are intentional. |
| 2 | Replace desktop poll matrices with ranked mobile summaries | Very high | Group coordination works on phones. |
| 3 | Replace compressed event-type forms with staged mobile editing | High | Core configuration becomes possible without excessive scrolling. |
| 4 | Create mobile object-list patterns | High | Meetings, people, teams, sessions, and offers require no horizontal panning. |
| 5 | Make sticky actions keyboard and safe-area aware | High | Forms remain operable with the on-screen keyboard. |
| 6 | Raise interactive target sizes and simplify repeated controls | High | Fewer input errors and better accessibility. |
| 7 | Add true 390 and 320 visual-regression coverage | High | Mobile regressions become observable. |

### Accessibility

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Make semantic structure and keyboard acceptance criteria mandatory | Very high | Accessibility stops being post-build cleanup. |
| 2 | Correct modal, drawer, menu, and focus-transition behavior | Very high | Core organizer flows work without a pointer. |
| 3 | Standardize error association and live announcements | High | Users can identify and repair failures. |
| 4 | Ensure selection state has native or equivalent semantics | High | Poll, duration, host, and filter controls are understandable. |
| 5 | Remove color-only meaning and verify contrast by theme | High | Status remains legible across custom themes. |
| 6 | Add skip links, landmarks, semantic headings, and labelled regions | Medium | Navigation becomes efficient for assistive technology. |
| 7 | Add automated accessibility tests plus manual keyboard and screen-reader scripts | High | Regressions are caught before release. |

### Visual refinement

Do this only after the preceding interaction architecture is stable.

| Rank | Initiative | User impact | Outcome |
| --- | --- | --- | --- |
| 1 | Establish product typography and density rules | Medium | Information hierarchy becomes predictable. |
| 2 | Reduce nested containers, borders, and excessive radii | Medium | Screens become easier to scan. |
| 3 | Reserve Calpaca green for action, selection, and healthy state | Medium | Color gains operational meaning. |
| 4 | Remove decorative sparkles, generic icon chips, and fake controls | Medium | Brand feels specific rather than generated. |
| 5 | Separate Calpaca product design from tenant themes such as TourScale | Medium | Custom branding no longer distorts the core application. |
| 6 | Refresh screenshots and marketing proof after product workflows stabilize | Medium | Marketing represents the actual product. |

---

## Phase 8: The three biggest wins

If only three areas can be redesigned before launch, choose these.

### 1. Rebuild the organizer architecture around durable routes and five work domains

#### Why this has the highest return

This is the root dependency for almost every serious issue.

It fixes:

- lost location
- false mobile navigation
- inline editors
- hidden settings
- inability to share support links
- weak object details
- navigation overload
- future feature sprawl

Without this change, every workflow improvement remains trapped inside a brittle dashboard shell. With it, Calpaca can evolve without adding another tab to a collapsing sidebar.

#### Launch outcome

Users understand where work lives, can return to it, and can share it. The product acquires a stable shape.

### 2. Redesign onboarding and meeting-type creation as one publishable workflow

#### Why this has the second-highest return

Meeting types are Calpaca's supply. If users cannot publish trustworthy supply quickly, every downstream feature is irrelevant.

This redesign fixes:

- first-run confusion
- fragmented calendar setup
- giant forms
- hidden dependencies
- unclear booking-page relationships
- duplicate configuration
- weak validation
- uncertain saved state
- poor mobile setup

It also creates the pattern for routing, sign-up sheets, polls, one-off offers, and future payments.

#### Launch outcome

A new user can connect a calendar, create a meeting type, preview it, and share a reliable link in under five minutes.

### 3. Unify Meetings and Coordinate around outcomes, exceptions, and mobile operation

#### Why this has the third-highest return

Calpaca's differentiation is broader than direct booking. Polls, sign-up sheets, one-off offers, team scheduling, and calendar overlays are meaningful only if their outcomes are easy to operate.

This redesign fixes:

- fragmented booking origins
- unusable mobile poll results
- generic Home metrics
- weak meeting detail
- poor cancellation and rescheduling context
- coordination lifecycle inconsistency
- hidden actions requiring attention

It turns feature breadth into a coherent product advantage.

#### Launch outcome

Organizers can see what is scheduled, what is still being decided, what needs intervention, and what completed, from desktop or mobile.

---

## Final product position

Calpaca should compete on operational clarity, not feature count or visual novelty.

Its promise should be:

> Publish how people can meet with you. Calpaca handles the decision, protects the calendar, and explains anything that gets in the way.

The public experience should feel effortless. The organizer experience should feel inspectable. The system should be powerful without presenting its entire power at once.

The next design cycle should not begin with components or mockups. It should begin by ratifying:

1. the five primary objects
2. the six-domain navigation model
3. the shared lifecycle
4. the distinction between collection, detail, editor, workflow, and diagnostic screens
5. the five primary mobile jobs
6. the three pre-launch redesign bets

Once those are settled, component and screen design can proceed without recreating the same structural problems in a more polished form.

## Benchmark sources

The strategy uses interaction principles documented by the products named in the brief:

- [Linear conceptual model](https://linear.app/docs/conceptual-model)
- [Linear issue creation and draft behavior](https://linear.app/docs/creating-issues)
- [Notion search and recent pages](https://www.notion.com/help/search)
- [Notion database views and side peek](https://www.notion.com/help/views-filters-and-sorts)
- [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics)
- [Stripe Workbench health and diagnostics](https://docs.stripe.com/workbench/overview)
- [Shopify Admin bulk actions](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/bulk-actions)
- [Shopify search, filters, and saved product views](https://help.shopify.com/en/manual/products/searching-filtering)
- [GitHub command palette](https://docs.github.com/en/get-started/accessibility/github-command-palette)
- [GitHub saved views](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/managing-your-views)
- [Vercel deployment object model](https://vercel.com/docs/deployments/overview)
- [Vercel logs and activity history](https://vercel.com/docs/logs)
- [Airtable interface layouts](https://support.airtable.com/docs/adding-layouts-to-interfaces)
- [Airtable inline editing and record details](https://support.airtable.com/docs/interface-designer-permissions)
- [Ramp transaction review](https://support.ramp.com/hc/en-us/articles/4417421399699-Transaction-reviews)

Figma and Mercury are used as product-principle references for contextual selection and consequential-action clarity. No visual imitation is proposed.

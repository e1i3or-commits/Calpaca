# Calpaca UI and UX audit

Audit date: July 23, 2026

Scope: the live marketing site at `https://calpaca.io/`, every client route in `web/src/main.tsx`, all thirteen organizer sections, shared components, responsive behavior, and every visual reference found in the repository.

## Method and evidence

The application was run locally against the test database and inspected from the route map, rendered output, component structure, and responsive CSS. Representative captures were reviewed at 1440 and 1280 desktop widths, 768 tablet width, and constrained mobile widths. The available Chromium runtime clamps its smallest CSS viewport above a true 390 or 320 width. Those two widths were therefore audited using the closest rendered capture plus direct inspection of every applicable breakpoint, minimum width, fixed position, wrapping, overflow, and touch-target rule. That limitation matters and should be corrected in the visual-regression setup.

The audit covered these public routes:

- `/`
- `/sign-in`
- `/booking` and `/booking/:workspace`
- `/booking/p/:page` and `/booking/:workspace/p/:page`
- `/book/:event` and `/book/:workspace/:event`
- `/r/:form` and `/r/:workspace/:form`
- `/reschedule/:booking`
- `/cancel/:booking`
- `/poll/:poll`
- `/offer/:offer`
- `/signup/:sheet`
- `/signup/cancel/:token`

It also covered all organizer sections under `/dashboard`: Home, Scheduling, Bookings, Polls, Sign-up sheets, Analytics, Profile & API, Availability, Routing, People & teams, Calendars, One-off offers, and Availability troubleshooter.

## 1. Executive assessment

### Overall verdict

Calpaca is functionally ambitious but visually and interactionally one release behind its feature set. The public booking flow has a recognizable product shape. The organizer application does not. It is a long collection of inline forms and bordered panels controlled by local tab state, with insufficient navigation context, weak mobile prioritization, inconsistent feedback, and accessibility gaps around dialogs, errors, headings, and touch targets.

| Dimension | Assessment |
| --- | --- |
| UX maturity | Early beta. Core flows exist, but the organizer experience lacks the guardrails, navigation model, and recovery behavior expected from a paid scheduling product. |
| Visual quality | Uneven. The marketing page is polished but over-produced. Public booking is calmer. The organizer UI resembles assembled component examples more than a deliberately designed work tool. |
| Mobile readiness | Not launch-ready. The public booking flow is plausible on mobile. The organizer workspace is compressed desktop UI with six bottom destinations, horizontal setup navigation, long forms, and horizontally scrolling data. |
| Desktop readiness | Usable for patient internal users, not yet credible for a broad paid audience. Desktop wastes space in some screens and overwhelms users in others. |
| Accessibility readiness | Not ready. Focus management, semantic headings, error announcements, target sizes, and keyboard behavior need systematic work. |
| Custom-designed or vibe-coded | Mixed. The Calpaca identity is distinctive, but the product UI relies heavily on generic rounded cards, icon chips, metric tiles, muted copy, pills, and centered SaaS layouts. |

### The three most damaging problems

1. **Organizer navigation has no durable location.** Every dashboard destination is React state inside one `/dashboard` route. Refresh, browser history, sharing, and deep links do not preserve the active section. On mobile, the menu icon does not open a menu. It jumps directly to Availability.
2. **The organizer workspace is a form warehouse.** Event types, routing, schedules, profile, teams, and booking pages are presented as large undifferentiated stacks. Primary tasks, object lists, editing state, save state, and destructive actions compete in the same visual plane.
3. **Mobile and accessibility were treated as CSS outcomes, not interaction requirements.** Six tiny bottom-navigation destinations, 32 to 36 pixel controls, horizontal tables, non-trapped dialogs, generic error text, and absent live announcements make important flows fragile.

## 2. Critical issues

| Severity | Screen or route | Viewport | Component or area | What is wrong | Why it matters | Recommended correction | Change type |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Critical | `/dashboard` | All | Dashboard navigation | The active destination exists only in component state. There are no child routes, persistent query state, breadcrumbs, or browser-history entries. | Refresh and Back lose context. Links cannot be shared. Support cannot direct a customer to a screen. This is foundational application behavior. | Give every organizer section a real URL, such as `/dashboard/bookings` and `/dashboard/settings/calendars`. Use route-aware navigation and preserve list filters in search params. | Design and code |
| Critical | `/dashboard` | Mobile | Header menu control | The menu icon labeled “Open setup” does not open a menu. It changes the active tab to Availability. | The control lies about its behavior and makes six setup areas effectively hidden behind a horizontal scroller. | Replace it with an accessible drawer containing all destinations, current-location state, account controls, and sign out. Trap focus, support Escape, and return focus on close. | Design and code |
| High | `/dashboard` | 320 to 390 | Bottom navigation | Six equal destinations use 10px labels in a fixed bar. “Sign-up sheets” and similar labels are cramped, and setup destinations are absent. | Targets are hard to scan and the information architecture becomes arbitrary on the smallest screens. | Keep at most four high-frequency destinations plus More. Make each target at least 44 by 44 pixels. Put all setup destinations in More. | Design and code |
| High | `/dashboard` booking details | All, worse mobile | Slide-over dialog | The custom `role="dialog"` has no focus trap, initial focus, Escape behavior, inert background, or reliable focus restoration. | Keyboard and screen-reader users can move behind the dialog and lose their place. | Implement a shared dialog primitive with focus trapping, Escape, labelled title and description, scroll locking, and focus return. | Code |
| High | Event type editor | Mobile and desktop | Entire form | A very long form combines identity, duration, capacity, buffers, schedule, theme, layout, hosts, locations, questions, and embed settings with Save near the end. | Users cannot build a mental model, miss invalid fields, and risk losing edits after substantial scrolling. | Split into a persistent object list and focused editor. Group Basics, Availability, Hosts, Location, Invitee form, Appearance, and Sharing. Use a sticky save bar with dirty and saved state. | Design, code, and content |
| High | Poll results, organizer poll results | 320 to 768 | Results table | Tables have fixed minimum widths of 36 to 38rem and rely on horizontal scrolling. Sticky first columns consume much of a phone viewport. | The product's group-scheduling differentiator becomes nearly unreadable on mobile. | Use a mobile result matrix with one candidate time per card or row, ranked summary first, and participant detail behind disclosure. Keep the matrix only at desktop widths. | Design and code |
| High | All forms and actions | Mobile | Shared buttons and inputs | Default buttons and inputs are 36px high; small variants are 32px. Many icon buttons are smaller still. | Common controls miss the 44px touch-target baseline and are error-prone for thumb input. | Make mobile interactive targets at least 44px while allowing denser visual content through internal padding and invisible hit areas. | Code |
| High | All asynchronous screens | All | Errors and status feedback | Most errors are plain paragraphs without `role="alert"` or live regions. Loading treatment varies between alpaca animation, skeleton cards, and literal “Loading…”. | Users do not reliably hear errors or understand whether an action succeeded, stalled, or failed. | Add shared inline error, page error, toast, loading, and success patterns. Announce state changes and include recovery actions. | Design, code, and content |
| High | Destructive organizer actions | All | Delete, remove, revoke controls | Multiple trash and revoke actions execute immediately or provide weak safeguards. Icon-only destructive controls can sit beside ordinary actions. | A scheduling system contains consequential shared data. Accidental deletion or removal is too easy. | Use confirmation only for irreversible actions, name the affected object, add undo where recovery is feasible, and separate destructive actions spatially. | Design and code |
| High | Marketing `/` | Mobile | Hero and product preview | The headline has a 56px minimum size, the decorative booking preview creates a large scroll block, and the preview contains button-like controls that do not perform actions. | The first screen prioritizes visual theatre over comprehension and can mislead users about interactivity. | Reduce the mobile type floor, replace the fake interactive preview with a clearly framed product screenshot or functional demo, and bring plan clarity closer to the first CTA. | Design, code, and content |
| High | Sign in | All | Authentication card | “Welcome back” is shown to every visitor, including first-time users. The page does not explain account creation, hosted-plan eligibility, self-hosting, privacy, or what Google access is requested. | Authentication is the highest-trust point in the funnel. Current copy is generic and incomplete. | Use “Sign in or create an account,” explain Google permissions and the resulting workspace, and link privacy and terms. | Content and design |
| Medium | Public booking and branded booking pages | All | Logo and heading semantics | Custom logos use empty alt text even when they replace the Calpaca wordmark. Shared `CardTitle` renders a `div`, not a heading. | Brand identity can disappear for assistive technology, and page structure is flatter than it appears visually. | Provide meaningful logo alt text or adjacent visible brand text, and make title levels semantic through `asChild` or explicit heading elements. | Code |
| Medium | Booking, routing, sign-up, cancellation | All | Validation | Several forms disable submission until complete but do not explain missing requirements. Errors are often page-level and some inputs lack `aria-invalid` and linked descriptions. | Disabled buttons conceal what remains to be done and make recovery harder. | Permit submission, validate visibly, focus the first invalid field, show field-level messages, and summarize only when several errors exist. | Design and code |

## 3. Screen-by-screen findings

### Marketing site, `/` and `https://calpaca.io/`

**User objective:** understand the product, judge trust and fit, compare hosted and self-hosted options, and start using it.

**What works:** the alpaca mark, restrained earth-and-green palette, direct hosted and self-hosted positioning, and visible pricing give Calpaca more identity than a typical scheduling clone. The live site and local page belong to the same visual system.

**What fails:** the page is too interested in looking like a launch page. It uses an oversized hero, pills, decorative sparkles, icon-plus-copy feature rows, rounded preview panels, and broad aspirational copy. “Scheduling that thinks ahead” and “AI scheduling” do not specify an actual user outcome. The booking preview looks operable but is decorative. It presents invented availability rather than evidence from the product. The transition from the opening CTA to plan choice is weak. “Open your workspace” implies an existing account while the same action is also the new-user path.

**Desktop:** at 1440 the visual balance is polished, but the hero and preview consume an excessive first viewport. The right preview competes with the conversion action. Sections repeatedly use centered headings and card grids even when users need comparison. Pricing needs a direct Basic versus Pro feature table rather than three presentation cards.

**Mobile:** the 56px minimum headline is too large at 320. The preview stacks into a tall decorative detour. Multiple centered sections increase scanning time. Mobile users need product definition, price, sign-in/create-account action, and a compact proof point before visual demonstration.

**Accessibility:** decorative motion should be verified under reduced-motion settings. Fake controls should not be focusable or visually imitate real controls. Link text such as “Learn more” needs stronger context. Confirm heading order and navigation disclosure behavior at the true 320px viewport.

**Content:** replace vague phrases with product-specific claims: booking links, team round robin, meeting polls, self-hosting, and calendar conflict protection. State “Free for individuals” and “$7 per user/month for Pro” near the primary CTA. Explain whether Google sign-in creates an account.

**Recommended change:** redesign the first viewport as a concise product proposition plus one real product capture. Follow it with a workflow-based comparison, then hosted pricing and self-hosting. Remove sparkles and decorative feature choreography.

### Sign in, `/sign-in`

**User objective:** authenticate safely and understand what happens next.

**What works:** one primary action and a restrained layout.

**What fails:** a small generic card floats in a large empty page. “Welcome back” assumes prior use. The calendar icon chip, card, and Google button could belong to any generated SaaS sign-in example. There is no account-creation explanation, legal context, support path, or permission preview.

**Desktop:** excessive empty space makes the product feel unfinished rather than focused.

**Mobile:** the card is serviceable, but its desktop-centered composition simply shrinks. There is no advantage gained from the available mobile space.

**Accessibility:** the error block is not announced as an alert. Busy state changes button text but does not expose `aria-busy`. The card title is a `div`.

**Content:** use “Sign in or create an account.” Explain that Google is used for identity and calendar connection, and that calendar selection can be changed later.

**Recommended change:** use a compact split at desktop with trust and permission copy, then a single-column mobile screen. Keep one action.

### Public booking-page index, `/booking` variants

**User objective:** select the correct meeting type from a host or workspace.

**What works:** clear event titles, duration, descriptions, and a direct link target. Custom themes and logos are supported.

**What fails:** “Schedule a meeting” plus a large centered page name repeats the same concept. Every event type is another large card. A long list becomes a generic two-column card grid with no grouping, search, or distinction between individual, group, and team events.

**Desktop:** cards leave significant empty space when descriptions vary. Hover lift and shadow are unnecessary. The content would scan faster as structured rows with title, purpose, host/team, duration, and action.

**Mobile:** the one-column cards are readable but create needless vertical length. There is no persistent workspace identity after a custom logo with empty alt text.

**Accessibility:** linked cards need a visible focus treatment equal to hover. `CardTitle` is not a semantic heading. Logo alternative text is empty.

**Content:** “No meetings are available yet” is a dead end. Provide host contact or a return action when configured.

**Recommended change:** use a compact event directory. Let custom pages organize selected events into named groups and optionally show host, format, and next availability.

### Individual booking, `/book/:event` variants

**User objective:** understand the meeting, choose host or duration when relevant, pick a time, provide details, and confirm.

**What works:** the flow is staged. Timezone is visible. Host selection, duration choices, multiple layouts, custom branding, best-time suggestions, locations, invitee questions, and calendar overlay are substantial product-specific capabilities.

**What fails:** progressive disclosure is incomplete. Host choice, duration, meeting metadata, calendar, time grid, and suggestion features can all compete before the user understands the next required decision. Metadata load failure is swallowed, causing temporary slug-based titles and content movement. Error feedback is usually a single paragraph above the content. Small duration controls and timezone controls are easy to miss.

**Desktop:** the TourScale split layout is the strongest supplied reference, but the left column can become a storage area for metadata. “Best times” competes with the calendar instead of clearly offering a shortcut. When many slots exist, the slot region becomes its own scroll area without strong boundary cues.

**Mobile:** the 500px reference is not proof of 390 or 320 readiness. Calendar, timezone, host selection, and slot selection stack into a long path. Three-column slot grids at narrow widths risk tiny targets. The user needs a persistent summary and clear step indicator.

**Accessibility:** status changes and load errors lack live-region semantics. Some selection controls use visual state without `aria-pressed` or radio semantics. Custom host role controls need explicit group labels. Focus should move to the details step after slot selection.

**Content:** “Best times” needs an explanation of why they are best. Location choices should say who calls whom for phone meetings. Confirmation copy should repeat timezone, location, and cancellation policy.

**Recommended change:** enforce a decision sequence: meeting summary, optional host/duration, date, time, details, confirmation. On mobile use one question per viewport region and a sticky selected-time action. Preserve context without a permanent oversized card.

### Routing form, `/r/:form` variants

**User objective:** answer qualifying questions and reach the right booking page.

**What works:** a short form and field-level issue model exist.

**What fails:** the visible title is created mechanically from the URL slug. “Answer a few questions and we'll route you” exposes internal system behavior rather than the user's benefit. There is no progress, privacy context, destination expectation, or branded identity.

**Desktop:** a narrow card centered in empty space looks like an internal utility.

**Mobile:** the layout fits, but select controls remain 36px high and multi-select behavior needs touch testing.

**Accessibility:** add a real `h1`, alert semantics, `aria-invalid`, and linked error descriptions. Preserve focus when server-side issues return.

**Content:** each routing form needs an authored public title, introduction, and submit label. Do not derive customer-facing copy from slugs.

**Recommended change:** support a short form-specific introduction and show “We’ll recommend the right meeting” only if that is the configured outcome.

### Reschedule, `/reschedule/:booking`

**User objective:** verify the current meeting, select a replacement, and confirm the change.

**What works:** current time is retained and confirmation is explicit.

**What fails:** it omits meeting title, host, invitee, and location from the initial context. A user with several meetings cannot confidently verify what is being changed. A conflict returns the user to selection but the recovery message is weak.

**Desktop:** another isolated card, disconnected from booking identity.

**Mobile:** the slot picker inherits the booking-flow density problems.

**Accessibility:** the Back control is a visually minimal button without an explicit type. Completion is not announced. Error content is not an alert.

**Content:** “Reschedule” is not enough context. State the meeting and organizer. Explain that the existing time remains reserved until confirmation.

**Recommended change:** put a compact booking summary above the picker and make the replacement process a labeled two-step flow.

### Cancel booking, `/cancel/:booking`

**User objective:** verify the meeting and deliberately cancel it.

**What works:** cancellation requires a click, which protects against email-link scanners. The destructive action is visually distinct.

**What fails:** the page does not identify the meeting being cancelled. The optional reason is a single-line input. There is no path back to the booking or reschedule alternative.

**Desktop:** the tiny centered card wastes space and weakens trust.

**Mobile:** usable, but the action lacks a nearby non-destructive escape.

**Accessibility:** errors and completion are not announced. Confirmation should move focus to the result heading.

**Content:** state title, organizer, date, time, and timezone. Offer “Reschedule instead.” A cancellation reason should be a textarea.

**Recommended change:** show the booking summary, then a clear destructive section with Cancel, Reschedule instead, and Keep booking.

### Meeting poll response and live results, `/poll/:poll`

**User objective:** assess candidate times, optionally compare a Google calendar, submit availability, and understand group consensus.

**What works:** responses are grouped by date; Available, If needed, and Unavailable include icons and text; calendar assistance is optional and editable; live results and finalized state are integrated.

**What fails:** the page puts voting, calendar connection, identity, sticky submission, and a dense result matrix inside one large rounded card. On phones, button labels disappear and users see only icons, increasing memory load. The sticky name/email panel is large enough to obscure candidate times. Results use a desktop spreadsheet on every viewport.

**Desktop:** the flow is understandable, but result ranking is buried below the matrix. The best candidate should be the primary output.

**Mobile:** the three choice controls are compressed. Icon-only choices make repeated rows harder, not faster. The 38rem matrix forces horizontal panning. Sticky identity fields consume scarce viewport height and can conflict with the mobile keyboard.

**Accessibility:** selected buttons should expose `aria-pressed` or use radios. Color must never be the sole cue; current marks help, but totals and rank need textual equivalents. Auto-updating results need a restrained live-region strategy. Error blocks need alert semantics.

**Content:** “If needed” is understandable; retain it. Explain whether calendar-derived answers have been saved. Make privacy and token expiry information more concise.

**Recommended change:** on mobile use full text in a segmented control or swipe-free three-state row, then show a ranked candidate summary. Put the full participant matrix behind “View response details.”

### Sign-up sheet and cancellation, `/signup/:sheet`

**User objective:** choose fixed sessions, register, and later cancel the registration.

**What works:** remaining capacity, full state, optional roster visibility, custom questions, and completion feedback are present.

**What fails:** every session is another bordered rounded container inside a card. Checkboxes have small native hit areas even though the label is clickable. The Register button is simply disabled until requirements are met. Registration cancellation can release multiple sessions with one click but does not list them first.

**Desktop:** the narrow single card underuses space for schedules with many sessions.

**Mobile:** labels, capacity, descriptions, and roster names can crowd a session row. There is no selected-session summary near Register.

**Accessibility:** required custom questions are indicated visually with an asterisk but need programmatic required state. Completion and errors need announcement. Full sessions need an explanation that remains legible at reduced opacity.

**Content:** replace generic failure text with the session that filled and a recovery path. Cancellation must name affected sessions.

**Recommended change:** organize sessions by day, use clear selectable rows, show a running registration summary, and present cancellation as a review step.

### One-off offer, `/offer/:offer`

**User objective:** claim one of a private set of offered times.

**What works:** it reuses the mature booking flow and has a clear unavailable terminal state.

**What fails:** the unavailable state is just a generic card with no organizer identity, reason, contact path, or alternative booking link. Single-use urgency and expiry are not explained early enough.

**Desktop and mobile:** inherited booking issues apply. Terminal states are particularly empty.

**Accessibility:** unavailable status needs a real heading and navigation option.

**Content:** distinguish expired, revoked, and already used only when that disclosure is safe. Always provide a configured fallback.

**Recommended change:** show who sent the offer, expiry, and a fallback meeting link before slot selection.

### Organizer Home

**User objective:** understand what requires attention and move to the next task.

**What works:** shortcuts connect to major objects.

**What fails:** “Good day” and “A focused view of what needs your attention” are generic filler. Metric cards do not establish priorities. The screen does not answer operational questions such as upcoming meetings, unresolved conflicts, disconnected calendars, open polls awaiting action, or setup completion.

**Desktop:** cards occupy space without a clear decision hierarchy.

**Mobile:** stacked tiles lengthen the path to actual work.

**Accessibility:** card titles inherit non-heading semantics. Clickable containers need one clear link, not nested interactive elements.

**Recommended change:** make Home an exception-driven work queue. Show only actionable setup warnings, today's bookings, polls ready to finalize, and recent outcomes.

### Organizer Scheduling

**User objective:** create, find, edit, share, and organize event types and custom booking pages.

**What works:** the feature coverage is broad, and links plus embed code are available near their objects.

**What fails:** creation and editing are inline with the object list. Event types and booking pages are separate concepts in one long page without a strong relationship model. Validation summary is improved by naming invalid fields, but most issues remain disconnected from the exact input. Embed code is presented in another nested panel. Delete actions are too immediate.

**Desktop:** it is a dense settings form disguised as a content list. The object being edited can disappear above the fold while Save sits far below.

**Mobile:** this is the weakest organizer screen. Two-column groups collapse into a very long sequence, small duration pills wrap, and repeated locations and questions compound scrolling.

**Accessibility:** several custom selection buttons need pressed state. Field groups need legends. Validation needs `aria-invalid`, descriptions, focus management, and an error summary live region.

**Recommended change:** show event types as a compact management list. Open creation and editing on a dedicated route with grouped sections and sticky actions. Give booking pages their own route.

### Organizer Bookings

**User objective:** review upcoming and past bookings, filter, inspect details, and take follow-up actions.

**What works:** status labeling and a detail view exist.

**What fails:** the custom detail drawer is inaccessible. Filters and status density need stronger hierarchy. Rows do not make the next useful action obvious. Booking details are assembled from generic titled sections rather than a meeting-specific layout.

**Desktop:** use a master-detail layout if frequent review is expected. A modal drawer makes comparison slower.

**Mobile:** rows need a concise title, participant, local time, and status. Secondary metadata should not all appear at once.

**Accessibility:** fix the dialog first. Status cannot rely only on color. Table or list semantics should match the rendered structure.

**Recommended change:** dedicated booking detail routes for durable links, with an optional desktop preview panel.

### Organizer Polls

**User objective:** create candidate times, monitor response, invite participants, finalize, reopen, or close.

**What works:** smart suggestions, deadline, limits, invitations, live counts, editing controls, and finalization provide real value.

**What fails:** poll creation, poll management, candidate ranking, participant matrix, and invitation controls coexist in one long screen. Closed polls still occupy substantial space. Collapsing helps but does not solve hierarchy. The creator's fast-time suggestion model needs a clearer review state before creation.

**Desktop:** the participant matrix and candidate cards duplicate information. Ranking should lead.

**Mobile:** datetime entry and result tables are laborious. Horizontally scrolling participant detail is not an acceptable primary view.

**Accessibility:** native datetime-local behavior varies, focus states need checking, and auto-refresh results need announcement restraint.

**Recommended change:** separate Poll list, New poll, and Poll detail routes. Make candidate generation a three-step interaction: window and constraints, suggested options, review and publish.

### Organizer Sign-up sheets

**User objective:** create fixed-capacity sessions and manage registrations.

**What works:** capacity, questions, roster visibility, and public links cover the core workflow.

**What fails:** creation begins with blank repeated session cards and placeholder-dependent inputs. There is no schedule visualization, timezone summary, duplication control, or clear preview of the attendee experience.

**Desktop:** repeated forms consume the page before the user can see existing sheets.

**Mobile:** datetime fields and repeated delete icons are cumbersome.

**Accessibility:** labels are missing where placeholders carry meaning. Icon-only deletion needs named targets and larger hit areas.

**Recommended change:** start from the list. Use a dedicated builder with a session table on desktop and day-grouped list on mobile.

### Organizer Analytics

**User objective:** understand booking volume, conversion, attendance, and distribution.

**What works:** basic metrics exist.

**What fails:** generic metric cards and large numbers appear without comparison periods, definitions, sample size, or clear decisions. “Team balance” is vague. Empty states do not teach users what activity will populate a report.

**Desktop:** visual space is spent on tiles rather than trends and explanations.

**Mobile:** metric cards stack into a long report with limited insight.

**Accessibility:** charts, if added, need equivalent tables. Current status colors and tiny captions need contrast verification.

**Recommended change:** lead with a date range and three questions: booking demand, completion outcome, and host distribution. Define every measure.

### Organizer Profile & API

**User objective:** manage public identity, organization title, profile image, and personal API tokens.

**What works:** image, name, title, timezone, and token generation are in one account area.

**What fails:** personal profile, organization identity, developer access, and workspace configuration are unrelated concerns placed together. “Profile & API” is a navigation smell. Token creation needs clearer one-time secret handling, naming, last-used data, and revocation consequences.

**Desktop and mobile:** the form is visually simple, but conceptual grouping is wrong.

**Accessibility:** file input styling and image removal need keyboard and screen-reader checks. Generated token status must be announced without reading the secret unintentionally.

**Recommended change:** split Account profile, Workspace branding, and Developer tokens into separate settings routes.

### Organizer Availability

**User objective:** define reusable weekly hours and date overrides.

**What works:** named schedules and timezone awareness are the correct model.

**What fails:** repeated weekday controls read as configuration data rather than a weekly schedule. Copying hours, applying to weekdays, exceptions, and previewing effective availability are not visually central. “No schedules yet” does not guide creation.

**Desktop:** use a compact weekly grid with copy/apply actions and an explicit overrides panel.

**Mobile:** a grid should become day accordions with summaries, not compressed columns.

**Accessibility:** day toggles need checkbox semantics and status text. Time fields need associated start/end labels per day.

**Recommended change:** expose the weekly pattern first, then exceptions and effective preview.

### Organizer Routing

**User objective:** build qualification questions and route answers to meeting types or hosts.

**What works:** multiple field types and rule clauses support a credible routing product.

**What fails:** users are asked to manipulate keys, operators, clauses, and destination objects with little plain-language preview. Blank fields and rules accumulate inside nested bordered panels. A form can be syntactically valid while remaining conceptually impossible to understand.

**Desktop:** the rule builder needs an if/then sentence layout and a live test panel.

**Mobile:** multi-column clauses should become one sentence-like stack. Current controls create excessive vertical and cognitive load.

**Accessibility:** rule groups need fieldsets and legends. Reordering, if introduced, must not be drag-only.

**Content:** remove developer terms such as key, clause, and operator from the default authoring view.

**Recommended change:** design rules as “When [answer] [condition] [value], send to [destination]” with a test response tool.

### Organizer People & teams

**User objective:** invite people, manage roles, create teams, and manage membership.

**What works:** admins can see all teams, and admin membership constraints have been corrected.

**What fails:** users, roles, teams, and membership management are crowded into one page. Search fields inside every team scale poorly. Trash icons do not explain whether they remove a member, delete a team, or revoke a user. There is weak visibility into pending invitations and access level.

**Desktop:** use separate People and Teams views with sortable lists.

**Mobile:** team cards become long clusters of names, roles, search, and destructive controls.

**Accessibility:** icon-only controls need object-specific accessible names. Role status needs text, not muted 12px fragments.

**Recommended change:** provide durable user and team detail routes, pending invitation status, and explicit action menus.

### Organizer Calendars

**User objective:** understand connected calendars, choose conflict calendars, choose the write calendar, and repair connection issues.

**What works:** the separation between checking conflicts and writing events is the right model.

**What fails:** it is easy for users to confuse these two concepts. Generic calendar rows and checkboxes do not expose connection health, account identity, permissions, last sync, or consequences.

**Desktop and mobile:** the same list is used at both sizes. On mobile, long calendar names and account addresses need deliberate wrapping.

**Accessibility:** switch and checkbox labels must include the calendar name and behavior. Connection errors need recovery actions.

**Recommended change:** group by Google account, label “Check for conflicts on” and “Add new events to,” and show connection status plus reconnect.

### Organizer One-off offers

**User objective:** create a private single-use link from exact available times and track its status.

**What works:** event type and duration reuse reduce setup effort.

**What fails:** selecting exact times is still form-like, and active, used, expired, and revoked offers lack a strong lifecycle model. “Revoke” is visually understated for a consequential action.

**Desktop:** a two-pane create and recent-offers layout would improve comparison.

**Mobile:** candidate choices should use the same accessible slot controls as public booking.

**Accessibility:** status must be text plus icon, and copied-link feedback should be announced.

**Recommended change:** show a simple step sequence and a status list with expiry, recipient label, use state, and explicit revoke confirmation.

### Organizer Availability troubleshooter

**User objective:** explain why a particular host, event type, date, or time is unavailable.

**What works:** this is highly product-specific and can reduce support load.

**What fails:** it is buried in setup navigation and named as a tool rather than a recovery path. Diagnostic results risk exposing internal reason codes and implementation structure rather than a clear blocker and fix.

**Desktop and mobile:** results should be a causal sequence, not another collection of cards.

**Accessibility:** pass/fail state cannot rely on color. Each finding needs an explicit status and fix link.

**Content:** translate every reason into “What blocked this time” and “How to fix it.”

**Recommended change:** link the troubleshooter contextually from event types, calendars, and booking errors, prefilled with the affected object.

### Shared loading, empty, error, confirmation, modal, and responsive states

**Loading:** three unrelated patterns exist: animated alpaca, generic pulse cards, and literal “Loading…”. The alpaca is appropriate for initial public navigation if brief and reduced-motion safe. It is distracting for every small organizer fetch. Use skeletons only when they resemble the incoming layout, and inline progress for actions.

**Empty states:** many are a centered muted sentence inside a dashed rounded box. They do not state why the area is empty or give the next action. Use one concise explanation plus a relevant primary action.

**Errors:** most are red text or a tinted rounded box. They frequently omit cause, recovery, affected object, and announcement semantics. Establish page, form-summary, field, and transient-action error levels.

**Confirmation:** successful public flows exist, but organizer saves do not share a reliable dirty, saving, saved, or failed model. Users need persistent save feedback for long forms.

**Modals and drawers:** there is no proven shared accessible modal primitive. The booking drawer is the clearest failure.

**Responsive behavior:** public pages mostly stack. Organizer pages frequently compress, wrap, or add horizontal scrolling. That is responsiveness in a mechanical sense, not mobile interaction design.

## 4. Cross-product consistency issues

### Buttons

- Primary actions can be green filled buttons, links styled as buttons, plain text controls, or icon-only actions.
- Small controls at 32px and defaults at 36px are below a reliable mobile target.
- Selected duration and choice buttons do not consistently expose pressed or radio state.
- Destructive actions range from red buttons to gray trash icons and understated ghost actions.
- Loading verbs vary between ellipses and unchanged labels. Disablement often substitutes for validation.

Replace this with a documented action hierarchy: primary, secondary, tertiary, destructive, and icon-only, all with loading, disabled, focus, and mobile target rules.

### Inputs

- Shared inputs are consistent visually but not behaviorally.
- Some fields have explicit labels while repeated builders depend on placeholders.
- Native selects and custom controls have different heights and focus treatments.
- Required, invalid, help, and success states are not systematic.
- Date and time entry is repeated instead of using product-specific scheduling controls.

### Tables and lists

- Desktop tables are pushed onto mobile through `overflow-x-auto`.
- Other object collections use large cards, even when rows would scan better.
- There is no common compact mobile representation for bookings, participants, users, or teams.

### Modals and drawers

- The booking detail panel imitates a modal without implementing modal behavior.
- Some creation flows are inline rather than modal or routed, so there is no consistent editing model.
- Confirmation and escape behavior differ by feature.

### Navigation

- Public pages have minimal brand navigation, organizer pages have local state navigation, and settings use a second horizontal tab strip on mobile.
- The current location is not encoded in the URL.
- The mobile menu icon is behaviorally false.
- There are no breadcrumbs or object-level back paths where editors need context.

### Spacing and containers

- `rounded-xl border` is the default answer for sections, choices, notices, empty states, and rows.
- Cards are frequently nested inside cards.
- Desktop alternates between excessive centered whitespace and dense full-width form stacks.
- Repeated padding does not create a consistent content rhythm because hierarchy is carried mostly by more containers.

### Typography

- Marketing typography is oversized and theatrical while organizer typography is small and muted.
- Important status and help copy often appears at 10 to 12px.
- Card titles are visual text styles rather than semantic headings.
- Uppercase micro-labels and tight tracking appear as decoration rather than information.

### Icons

- Icons are used heavily for generic concepts already named in text.
- Icon chips add decorative containers around ordinary calendar and feature icons.
- Trash icons lack adequate contextual labeling and visual separation.
- The alpaca mark is distinctive; most Lucide icon usage is not.

### Status indicators

- Status can be color, text, a badge, background tint, icon, or some combination.
- Poll status is the most understandable because it includes words and symbols.
- Booking, calendar, invitation, and one-off lifecycle states need the same explicit treatment.

### Empty states and errors

- Empty states are passive and repetitive.
- Errors vary in padding, border, background, and wording.
- Neither pattern consistently includes an action or appropriate live semantics.

### Responsive behavior

- Breakpoints are mostly `sm` and `md`, with too little component-specific behavior.
- Desktop cards become vertically stacked mobile cards.
- Desktop matrices become horizontally panned mobile matrices.
- Fixed mobile navigation and sticky poll submission compete for viewport space and the on-screen keyboard.

## 5. Screenshot and visual-reference comparison

### Product screenshots

| File | Screen represented | Viewport | Match to current implementation | Significant differences | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `docs/screenshots/landing.png` | Original Calpaca landing page | Desktop, 1440 × 900 | No | It shows the earlier sparse “Make time feel a little more human” page. The live marketing site is now a full launch page with pricing, features, and product preview. | Label it explicitly as historical or replace it with current live-site captures. |
| `docs/screenshots/booking.png` | TourScale branded individual booking | Desktop, 1200 × 900 | Broadly | Split layout, profile, best times, calendar, and slots remain relevant. Current implementation supports more host, duration, location, and overlay states not represented here. | Keep as a TourScale-theme target, then add current default, multi-host, and details-step screenshots. |
| `docs/screenshots/booking-mobile.png` | TourScale booking page stacked layout | Narrow desktop/mobile-like, 500 × 900 | Broadly | It does not prove 390 or 320 behavior. It captures only the upper selection state and cuts off the calendar flow. | Replace with true 390 × 844 and 320 × 568 captures covering selection, details, validation, and confirmation. |
| `docs/screenshots/organizer-embed.png` | Scheduling tab and embed controls | Desktop, 1440 × 1000 | Partial | Navigation has expanded since the capture. The current event editor contains more settings and more nested panels. | Replace with current Scheduling list and dedicated editor captures after navigation restructuring. |

### TourScale design package visual references

| Files | Screen or asset represented | Viewport | Match to current implementation | Significant differences | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `uploads/pasted-1781809328669-0.png` through `pasted-1781809409136-0.png` | Canva palette screenshots for Paddle Pub, Trolley Pub, Tiki Pub, and Cruisin' Tikis | Desktop references around 1040px | Not a product UI target | These document palette extraction, not scheduling interactions. They use Canva chrome and should never be treated as component references. | Reclassify under brand-source references with descriptive names. |
| `uploads/pasted-1781809477852-0.png` and `pasted-1781809548491-0.png` | Tiki Pub palette swatches | Small desktop reference, 498 × 147 | Not applicable | Duplicate palette evidence, not interface direction. | Deduplicate and replace with a single token specification. |
| `assets/logos/*` and `uploads/Tour Scale Logos_*` | TourScale identity assets | Asset references | Implemented selectively | Many duplicates and format variants make the source of truth unclear. | Keep one canonical SVG and documented raster exports. |
| `assets/brands/*.jpg` and `*.png` | TourScale portfolio brands and photography | Marketing references | Not applicable to Calpaca core UI | Useful for TourScale's custom theme only. They conflict with Calpaca's general brand if reused globally. | Scope them to the non-shipping TourScale theme and its documentation. |
| `assets/brands/hero.jpg` | TourScale brand hero image | Marketing reference | Not used in core product | It is not evidence for scheduling UI. | Retain only if used in TourScale-specific materials. |
| `scraps/core-check.png` | Internal visual check | Reference | Not a maintained product target | “Scrap” naming provides no provenance or status. | Remove if obsolete or document what it verifies. |
| `decks/cruisin-tikis-onboarding/assets/*` | Deck photography and logos | Presentation references | Not applicable | These belong to a presentation workflow, not application UI. | Exclude from UI source-of-truth documentation. |

The `design/TourScale Design System.zip` also contains HTML component examples and tokens. It is a TourScale account reference, not a Calpaca design-system specification. Its generic FeatureCard, StatCard, Badge, IconChip, and Button examples should not drive the product's structure.

### Contradictions

- The old landing screenshot promotes a minimal homepage, while the live site is a full marketing experience.
- The booking screenshots show TourScale as if it were the product identity, while Calpaca is now the hosted public product and TourScale is a custom account theme.
- The organizer screenshot suggests one simpler scheduling workflow, while the implementation has accumulated substantially more inline controls without a new information architecture.
- The design zip mixes brand references, component demos, presentation assets, uploads, and scraps in one archive. It is not a dependable design source of truth.

## 6. Vibe-code indicators

| Indicator | Where it appears | Why it feels generated | What should replace it |
| --- | --- | --- | --- |
| Rounded cards for nearly every grouping | All organizer screens and most public utilities | Containers substitute for hierarchy. Nested cards make everything equally important. | Use page structure, dividers, rows, and typography. Reserve cards for truly independent objects. |
| Generic “Welcome back” | Sign in | It is context-free template copy. | “Sign in or create an account,” plus permission and account details. |
| Generic “Good day” dashboard | Organizer Home | It says nothing about scheduling work. | Actionable status: today’s bookings, setup problems, and polls ready to finalize. |
| Icon chip above a heading | Sign in, poll, marketing | A colored rounded square around a Lucide icon is decorative template language. | Use fewer icons. Let product identity, title, and task context create hierarchy. |
| Metric-card analytics | Home and Analytics | Large numbers without decisions or comparisons mimic dashboard demos. | Show defined trends and operational questions with time context. |
| Decorative sparkle and “AI” claims | Marketing | It signals generic AI-launch styling without demonstrating the capability. | Name the automation, show the trigger and result, and use a real product example. |
| Pill controls everywhere | Marketing CTAs, duration choices, setup navigation, badges | Pills blur actions, filters, states, and navigation into the same shape. | Give each control class a distinct geometry and placement. |
| Centered card in empty viewport | Sign in, cancel, reschedule, routing | It is the easiest component-library composition, not a task-specific screen. | Add the exact meeting, account, trust, or routing context the task requires. |
| Feature grids | Marketing | Equal cards imply equal importance and force scanning through slogans. | Organize by real workflows and compare what users can accomplish. |
| Excessive muted text | Organizer and public supporting copy | Important constraints and status become low-contrast decoration. | Use normal foreground for essential information; reserve muted text for genuinely secondary metadata. |
| Dashed empty-state cards | Several organizer sections | Repeated placeholder treatment makes unfinished areas look permanent. | One clear explanation and task-specific action in the page flow. |
| Hover lift and shadow on linked cards | Booking-page directory and marketing | Adds “premium” motion without improving selection. | Use clear row hover/focus state and an explicit destination cue. |
| Generic loading skeleton tiles | Organizer | They do not resemble the eventual layouts. | Use layout-specific skeletons or compact progress indicators. |
| Every feature sharing one visual density | Organizer | Lists, builders, settings, reports, and diagnostics all look like forms in cards. | Define purpose-specific patterns for collections, editors, reports, and diagnostics. |

## 7. Prioritized recommendations

### Fix immediately

1. Replace dashboard local tab state with route-backed navigation.
2. Replace the false mobile menu action with a real accessible navigation drawer.
3. Fix booking-detail dialog focus management and semantics.
4. Raise mobile touch targets to at least 44px.
5. Add shared error announcement and field-validation behavior.
6. Protect or undo destructive organizer actions.
7. Stop using desktop-wide poll tables as the primary mobile results view.
8. Capture true 390 and 320 screenshots in automated visual testing.

### Fix before launch

1. Separate organizer object lists from dedicated create and edit routes.
2. Rebuild Event type editing around clear task groups and sticky save status.
3. Separate Profile, Workspace branding, and API tokens.
4. Rework People and Teams into independent management views.
5. Add meeting identity to cancel and reschedule screens.
6. Replace disabled-submit validation with visible, focusable errors.
7. Make loading, empty, error, success, and saved states consistent.
8. Simplify marketing hierarchy and make the preview explicitly real or explicitly illustrative.
9. Clarify sign-in, account creation, Google permissions, privacy, and plan implications.
10. Give every public terminal state a recovery or fallback action.

### Improve after core usability is stable

1. Turn Home into an exception-driven work queue.
2. Redesign poll creation as constraint, suggestion, and review steps.
3. Add contextual links into the availability troubleshooter.
4. Replace analytics tiles with defined, comparable reports.
5. Create mobile-specific list representations for bookings, people, teams, and sessions.
6. Add authored titles and introductions to routing forms.
7. Consolidate TourScale brand assets and document their scope.

### Optional visual refinements

1. Reduce border radii and remove non-functional shadows.
2. Remove decorative icon chips and sparkles.
3. Reduce the marketing headline size floor on narrow screens.
4. Tighten long public-page vertical spacing.
5. Use the alpaca loader only for meaningful page transitions.
6. Improve logo alternative text and branded header consistency.

## 8. Proposed design direction

### Product model

Calpaca should feel like a scheduling operations tool with a personable public face. The organizer side should optimize repeated management. The invitee side should optimize one confident decision. Those are different interfaces and should not share the same card-heavy composition.

### Visual hierarchy

Use three levels:

1. **Location:** route title, object identity, and status.
2. **Work:** the list, calendar, builder, or result that answers the screen's main question.
3. **Support:** metadata, guidance, secondary actions, and diagnostics.

Do not create hierarchy by wrapping each level in another bordered container.

### Layout philosophy

- Organizer desktop: stable sidebar, compact page header, then a purpose-specific working surface.
- Object management: dense list plus filters, not card grids.
- Editors: dedicated route, readable section navigation, sticky save status.
- Reports: date context, ranked findings, then detail.
- Public pages: narrow decision path with the meeting or poll identity always visible.

### Navigation model

Use real routes. Group the organizer into:

- Home
- Scheduling: Event types, Booking pages, One-off offers
- Group coordination: Polls, Sign-up sheets
- Meetings: Bookings, Analytics
- Workspace: People, Teams, Calendars, Availability, Routing
- Account: Profile, API tokens

On mobile, show Home, Scheduling, Meetings, and More. “More” opens the full navigation drawer. Object editors receive a visible back path and their own URL.

### Typography

Keep a restrained display face for marketing only if it remains highly legible. Use one workhorse sans serif for the product. Establish a small, deliberate scale: page title, section title, object title, body, metadata. Important instructions should not fall below 14px. Use 12px only for truly optional metadata, never for status or required guidance.

### Color usage

Calpaca green should mark primary actions, selected states, and successful outcomes, not every decorative icon. Amber should mean attention or “if needed,” and red should mean destructive or unavailable. Neutral structure should do most of the work. TourScale colors remain a tenant theme, not the organizer system.

### Component density

Desktop management screens should become denser, while mobile controls should become physically larger. These are not contradictory. Reduce decorative padding and cards on desktop. Preserve at least 44px hit areas on mobile. Show fewer fields at once through task grouping.

### Mobile behavior

Mobile is not a narrower dashboard. Prioritize:

- one primary destination at a time
- four or fewer persistent navigation items
- bottom actions that account for the keyboard and safe area
- summaries before detail
- no required horizontal table panning
- day-grouped schedules and polls
- explicit progress for long workflows

### Brand personality

The alpaca can communicate friendliness through the mark, loading walk, plain language, and small moments of wit. Do not turn it into a layer of novelty icons, sparkles, or animation. The product should feel calm because the interaction is predictable, not because the copy says it is.

### Remove

- generic greetings
- decorative sparkles and icon chips
- fake interactive marketing controls
- cards nested inside cards
- passive dashed empty boxes
- pill-shaped treatment for unrelated control types
- tiny muted operational text
- desktop tables forced onto phones
- slugs converted into public titles

### Emphasize

- who the meeting is with
- what decision is required now
- local time and timezone
- calendar connection health
- object lifecycle and status
- next best action
- saved state and error recovery
- hosted versus self-hosted ownership

## 9. Implementation plan

| Priority | Engineering task | Relevant files or components | Exact intended change | Dependencies | Risk | Acceptance criteria |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Route the organizer workspace | `web/src/main.tsx`, `web/src/pages/dashboard-page.tsx` | Add child routes for every organizer destination and object editor. Derive active navigation from the route, not local tab state. Preserve useful filters in query params. | Route design and backward-compatible `/dashboard` redirect | Medium | Refresh, Back, Forward, direct links, and copied URLs preserve the exact organizer screen. |
| P0 | Build accessible mobile navigation | `dashboard-page.tsx`, new shared drawer component | Replace “Open setup” jump with a full drawer. Reduce fixed bottom navigation to four destinations including More. | Routed navigation | Medium | At 320px all destinations are reachable, current location is announced, focus is trapped, Escape closes, and focus returns. |
| P0 | Add an accessible dialog primitive | New `web/src/components/ui/dialog.tsx`, booking detail panel | Implement title and description association, focus trap, initial focus, Escape, scroll lock, inert background, and focus restoration. | None | Medium | Keyboard and screen-reader dialog tests pass and background controls cannot receive focus. |
| P0 | Standardize feedback and validation | New status components, shared form helpers, all pages | Add page error, inline alert, field error, save status, toast, and loading patterns. Use `role="alert"` or `aria-live` only where appropriate. | Content inventory | Medium | Every failed submit identifies the problem, focuses the first invalid field, and gives a recovery action. Success and loading are announced once. |
| P0 | Meet mobile target sizes | `ui/button.tsx`, `ui/input.tsx`, selects, icon actions, poll controls | Use 44px minimum interactive height below the desktop breakpoint and adequate icon hit areas. | Visual regression updates | Low | Automated checks and manual inspection confirm 44 by 44 targets at 320 and 390 widths. |
| P0 | Replace mobile poll matrix | `poll-page.tsx`, organizer Poll detail | Add ranked candidate summary and mobile disclosure per candidate. Keep desktop matrix at suitable widths. | Product decision on tie display | Medium | No horizontal scrolling is required to understand rank, totals, or an individual's response at 320px. |
| P1 | Split Scheduling list and editor | `dashboard-page.tsx`, EventTypesTab, EventTypeForm, BookingPagesManager | Move event and booking-page editors to dedicated routes. Add section navigation and sticky dirty/saving/saved bar. | Routed organizer | High | A user can find, create, edit, preview, share, and delete without losing list context. Validation points to exact fields. |
| P1 | Reorganize account and workspace settings | ProfileTab, WorkspaceCard, UserManagementPanel, TeamTab, CalendarsTab, SchedulesTab | Separate Account, Workspace, Developer, People, Teams, Calendars, and Availability routes. | Routed organizer | Medium | Each page has one coherent user objective and no unrelated settings. |
| P1 | Correct destructive action behavior | All delete, remove, revoke, and cancellation handlers | Add object-specific confirmation for irreversible changes and undo for recoverable removal. Separate destructive controls from routine actions. | API recovery capabilities | Medium | No destructive action occurs from one ambiguous icon click. Confirmation names the object and consequence. |
| P1 | Redesign cancel and reschedule context | `cancel-page.tsx`, `reschedule-page.tsx`, booking APIs | Render meeting title, organizer, date, timezone, and location. Offer reschedule from cancellation and preserve old time until replacement confirmation. | API may need additive booking context | Medium | A user can identify the meeting without returning to email and has a safe escape action. |
| P1 | Clarify authentication | `sign-in-page.tsx`, marketing links | Replace generic greeting, explain new-account behavior and requested Google access, and add privacy and terms links. | Approved legal URLs and permission copy | Low | A first-time user can accurately predict what clicking Google will create and authorize. |
| P1 | Simplify marketing conversion path | `marketing-page.tsx`, real product captures | Reduce mobile headline floor, replace fake interactive preview, make Basic and Pro differences explicit near CTA, and remove decorative AI cues. | Current product screenshot set | Medium | At 320 and 1440 the first viewport states product, audience, free entry point, Pro price, and one unambiguous action. |
| P1 | Introduce semantic structure | `ui/card.tsx`, all pages | Allow semantic heading levels, meaningful logo text, labelled regions, and consistent fieldset usage. Add a skip link to organizer and marketing layouts. | Component audit | Medium | Automated accessibility scan finds no heading-level, label, dialog, or missing-name failures in primary flows. |
| P2 | Rebuild poll creation | PollsTab and poll APIs | Use window, constraints, suggested times, review, and publish stages. Snap manual choices to the selected duration interval. | Existing suggestion API | Medium | A creator can produce a five-option poll without manually entering five datetimes. |
| P2 | Create mobile collection patterns | Bookings, People, Teams, Sign-up sheets, Offers | Provide consistent compact rows/cards with primary metadata and disclosure, not desktop tables. | Design specification | Medium | All collections are usable without horizontal panning at 320px. |
| P2 | Turn Home into a work queue | HomeTab and summary APIs | Replace greeting and generic metrics with today, setup problems, polls ready to finalize, and recent outcomes. | Aggregated dashboard data | Medium | Every displayed module either requires action or answers a current operational question. |
| P2 | Contextualize the troubleshooter | Troubleshooter, Event types, Calendars, booking errors | Link into a prefilled diagnostic from relevant failure points and translate codes into cause and fix. | Query-param or route-state contract | Low | A user can launch a diagnosis from an unavailable time and reach a specific corrective action. |
| P3 | Consolidate visual references | `docs/screenshots`, `design/TourScale Design System.zip`, `web/public` | Replace historical captures, add provenance, remove duplicate brand exports, and separate TourScale tenant references from Calpaca UI specifications. | Finalized route redesign | Low | Every screenshot has viewport, date, route, state, and status. One canonical asset exists per logo variant. |
| P3 | Add visual and accessibility regression coverage | Test configuration, screenshot fixtures | Capture 1440, 1280, 768, 390, and 320 for major routes and states. Add keyboard and automated accessibility checks. | Stable seeded UI states | Medium | CI produces true CSS-width captures and blocks regressions in overflow, focus, labels, and contrast. |

## Final judgment

Do not spend the next cycle polishing shadows, easing curves, or theme variants. The product needs durable navigation, task-specific page structures, mobile interaction models, accessible state handling, and clearer object identity. Calpaca already has enough features to be credible. The interface currently hides that credibility under generic SaaS composition and accumulated inline forms.

Fix the organizer shell and Event type workflow first. Then fix poll results on mobile and the public trust surfaces around sign-in, cancellation, and rescheduling. Only after those foundations hold should the marketing page receive another visual pass.

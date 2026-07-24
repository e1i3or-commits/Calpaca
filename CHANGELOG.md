# Changelog

Calpaca follows [Semantic Versioning](https://semver.org/). Releases are
tracked with annotated Git tags named `v<version>`.

## [Unreleased]

### User-facing improvements

- Added Engagements as a durable client-work context. Organizers can create
  Potential or Active engagements, assign an account lead and contributors,
  preserve an in-progress draft, find possible duplicate clients, and review
  linked conversations and meetings from one overview.
- Engagement lists support direct search and lifecycle filtering without
  changing existing booking or event-type behavior.
- Engagements now organize scheduling as Conversation playbooks. Organizers
  can define each conversation's purpose, required roles, preparation,
  intended outcome, duration, host, and availability schedule.
- Existing event types remain the scheduling source of truth. They can be
  reused as workspace playbooks, copied into an Engagement, and opened in the
  existing advanced editor without changing their public booking behavior.
- Draft playbooks identify missing publishing decisions and cannot be marked
  Ready until their scheduling and outcome requirements are complete.
- Recommended booking times now explain the recorded availability and
  preference signals behind their ranking. Calendar confidence is shown as
  confirmed, delayed, or unavailable, with the evidence time when known.
- Hosted plans are now named Cloud Basic and Cloud Pro to distinguish the
  managed service from the self-hosted Community Edition.
- Engagements now support durable scheduling proposals. Organizers can turn a
  Ready conversation into two or more explained options, review client-facing
  and internal context separately, require internal confirmation when
  participant evidence is incomplete, send an opaque client link, and
  withdraw an unanswered proposal.
- Clients can choose a proposed time in their own timezone or request other
  options. Acceptance uses the existing transactional hold and booking path,
  so a lost slot does not create a partial meeting and a proposal can be
  accepted only once.
- Sent proposals are delivered through the managed email queue and preserve
  their Engagement, Conversation, recipient, expiry, response, and resulting
  booking.
- Clarified that continuing with Google signs existing users in and creates a
  Calpaca account for new users.
- Replaced the misleading mobile setup-menu action with an accurately labeled
  availability-settings shortcut.
- Replaced infrastructure-oriented sign-in failures with actionable guidance
  for connection problems, expired sessions, Google cancellations, rate
  limits, and provider failures.
- Copy actions for booking links, booking pages, embeds, routing forms, polls,
  sign-up sheets, one-off offers, and API tokens now confirm success without
  shifting nearby controls.
- Organizer loading states now identify the content being loaded instead of
  displaying an ambiguous generic message.
- Empty event-type, schedule, routing, team, offer, poll, and custom-page
  states now explain their purpose and provide a direct creation action.
- Booking details now keep keyboard focus inside the open panel, close with
  Escape, prevent background scrolling, and return focus to the booking row
  that opened them.
- Poll results now use ranked time summaries with participant details on
  mobile, removing the need to pan across a wide response matrix.
- Calendar settings now distinguish the account, conflict-checking role,
  new-meeting destination, and sync health of every calendar.
- Expired offers, invalid cancellation and reschedule links, closed sign-up
  sheets, and unknown routes now provide a safe way back to Calpaca.
- Event-type editing now keeps Basics visible and groups Hosts, Availability,
  Location, Invitee form, Appearance, and Sharing into named disclosures.
  Sections containing server validation errors reopen automatically.
- Organizer screens now have durable `/app` locations that survive refresh,
  browser Back, and direct linking. Existing `/dashboard` links remain valid
  during migration.
- Mobile organizer navigation now focuses on Home, Engagements, Meetings, and
  More. The accessible More sheet retains every existing scheduling tool and
  workspace setting during migration.
- Polls, sign-up sheets, routing forms, and one-off offers now appear under a
  clearly labeled secondary Tools section on desktop.
- Meeting details now have durable `/app/meetings/:id` links while preserving
  the existing accessible panel, browser Back behavior, and focus return.
- Event types now use dedicated, refresh-safe routes for creation and editing.
  The existing fields, validation, and save behavior remain unchanged, while
  the editor no longer competes with custom booking-page management.
- Personal profile, workspace identity and domains, API access, people, and
  calendar connections now have clearly scoped, refresh-safe destinations.
  Existing settings and permissions are unchanged.
- Existing event types can now open the availability troubleshooter with the
  event and duration already selected. Diagnostic links open separately to
  preserve unsaved editor changes, and can also prefill a specific time.

### Accessibility improvements

- Engagement creation uses associated labels, native controls, named setup
  steps, announced loading and error states, and keyboard-reachable actions.
- Conversation navigation, editor sections, readiness feedback, loading
  states, and save results expose explicit names and status semantics.
- Recommendation explanations use named expandable controls, descriptive
  confidence text, and reason types that do not rely on color alone.
- Proposal forms use associated labels, announced errors and loading states,
  native email validation, keyboard-reachable lifecycle actions, and explicit
  status text.
- Public booking, cancellation, rescheduling, routing, poll, sign-up sheet,
  suggestion, sign-in, and organizer errors are now announced to assistive
  technology.
- Booking-duration and poll-response controls now expose their selected state
  programmatically.
- Required sign-up sheet identity and custom-question fields now use native
  required-field semantics.
- Custom booking-page event links now display a visible keyboard focus state.
- Busy sign-in actions now expose their progress state to assistive technology.
- Invalid routing-form answers now identify their controls, expose associated
  error descriptions, and move keyboard focus to the first field that needs
  correction.
- Dynamic errors across every organizer dashboard workflow are now announced
  consistently to assistive technology.
- OAuth callback failures now return to Calpaca's sign-in screen without
  exposing provider descriptions or unsafe error values.
- Clipboard success is announced through polite live regions, while clipboard
  failures use each workflow's existing error announcement.
- In-place organizer loading messages now use consistent status semantics for
  assistive technology.
- The booking-detail panel now has stable dialog naming, visible initial focus,
  and complete keyboard focus management.
- Event-type validation summaries now focus the exact invalid control, and
  affected fields expose linked inline messages and programmatic invalid state.

### Mobile improvements

- Engagement lists become stacked, readable records on narrow screens, and
  the four-step creation map remains horizontally accessible without forcing
  a desktop form into the viewport.
- Conversation rows stack their purpose and actions on mobile. Playbook
  sections remain horizontally reachable, and workspace playbooks open in a
  full-height mobile sheet.
- Recommended times keep the booking action prominent on narrow screens while
  placing supporting evidence in an expandable explanation.
- Proposal lists, review summaries, option comparisons, client responses, and
  terminal states stack into a single readable column on narrow screens.
- The organizer header shortcut now uses an availability icon and accessible
  label that accurately describe its destination.
- Poll response controls retain accessible names when their visible labels are
  condensed on smaller screens.
- Buttons, calendar navigation, organizer navigation, and compact icon actions
  now provide at least 44-pixel touch targets through tablet widths while
  retaining the existing desktop density.
- Public and organizer poll results now remain readable without horizontal
  panning on narrow screens; the detailed desktop matrix is preserved.

### Breaking changes

- None.

### Screenshots changed

- Updated the sign-in reference screenshot to reflect the clarified account
  creation and Google connection messaging.
- Added before-and-after sign-in screenshots under
  `docs/screenshots/migration-plan/`.
- Added empty-state and mobile touch-target comparisons under
  `docs/screenshots/migration-plan/`.
- Added desktop and mobile event-type route comparisons under
  `docs/screenshots/migration-plan/l-03/`.
- Added account, workspace, and mobile settings-navigation comparisons under
  `docs/screenshots/migration-plan/l-05/`.
- Added standalone and context-prefilled availability diagnostic comparisons
  under `docs/screenshots/migration-plan/l-06/`.
- No existing reference screenshots changed for the additive Engagement
  release.
- No repository screenshots changed for recommendation provenance. Pricing
  references now render Cloud Basic and Cloud Pro in the application.
- No repository screenshots changed for the additive Proposal release.

### Migration notes

- Apply generated database migration `0043_tiresome_marrow.sql` before starting
  the new application version. Existing event types remain unassigned and all
  booking behavior is unchanged.
- Apply generated migration `0044_superb_red_hulk.sql` to add playbook metadata
  to event types. Existing event types default to Ready and retain their
  current links, hosts, availability, and booking settings.
- Recommendation provenance is additive and requires no migration. Clients
  that do not render the new availability response field continue to work.
- Apply generated migrations `0045_magenta_young_avengers.sql`,
  `0046_early_ser_duncan.sql`, and `0047_medical_karen_page.sql` in order.
  Existing bookings, one-off offers, event types, and public links are
  unchanged.

## [0.19.0] - 2026-07-23

### Added

- A complete responsive marketing website for `calpaca.io` with product
  previews, feature and team scheduling sections, hosted and self-hosted
  paths, plans, frequently asked questions, and public calls to action.
- Animated alpaca loading screens for initial application startup and public
  data-loading states.

### Fixed

- Public marketing pages now retain their intended light appearance when an
  organizer previously selected dark mode.
- Event-type validation failures now display the exact invalid fields and
  server messages with links that focus the relevant controls.

## [0.18.1] - 2026-07-23

### Fixed

- Serialized overlapping host claims across event types and bound hold
  confirmation to the requested event type, time, and host set.
- Enforced published slot policies at hold time while retaining explicit
  one-off offer exceptions.
- Tightened shared event-type and one-off offer management permissions.
- Released unusable verification holds, reaped expired verification records,
  and added missing one-off offer and availability-diagnostic API docs.

## [0.18.0] - 2026-07-23

### Added

- Optional per-event-type invitee email verification with single-use
  six-digit codes, generic request responses, resend and attempt controls,
  and event/email-scoped trusted-browser receipts.

## [0.17.0] - 2026-07-23

### Added

- An organizer availability troubleshooter with per-host, privacy-safe
  explanations for scheduling-policy, working-hours, time-off, buffer, and
  calendar-conflict blockers.

## [0.16.0] - 2026-07-23

### Added

- One-off offers with curated exact times, optional recipient-email
  restrictions, expiry and revocation controls, and transaction-safe
  single-use redemption.

## [0.15.0] - 2026-07-23

### Added

- Persistent dark mode across organizer surfaces, initialized from the
  operating-system preference and switchable from desktop or mobile navigation.
- A persistent collapsible desktop sidebar with accessible icon labels.

## [0.14.0] - 2026-07-23

### Added

- Custom public booking pages with ordered event selection, independent
  themes, logos, titles, descriptions, and dedicated share links.

### Changed

- Meeting poll cards can be collapsed to keep the organizer dashboard compact.

## [0.13.0] - 2026-07-23

### Added

- Multiple selectable durations per event type, with duration-aware
  availability, hold validation, and rescheduling that preserves the booked
  length.
- Public workspace booking pages that present several meeting options in one
  mobile-friendly catalogue.

## [0.12.0] - 2026-07-23

### Added

- Labeled Google Meet, phone, in-person, and custom-link locations with
  per-host overrides and booking-time snapshots across notifications,
  calendars, webhooks, details, and exports.

## [0.11.0] - 2026-07-23

### Added

- Typed custom booking questions for event types, including required,
  hidden, select, multiselect, phone, checkbox, and long-text fields with
  server-side validation and lifecycle propagation.

## [0.10.0] - 2026-07-23

### Added

- Sign-up sheet enrollment controls for attendee cancellation, confirmation
  resend, CSV export, public roster privacy, enrollment state, and session
  capacity changes that preserve existing registrations.

## [0.9.0] - 2026-07-23

### Added

- Sign-up sheets with fixed named sessions, per-session capacity, custom
  questions, per-person registration limits, public enrollment and
  cancellation, organizer rosters, and calendar-invitation confirmations.

## [0.8.0] - 2026-07-23

### Added

- Capacity event types with configurable seats per time, live remaining-seat
  counts, and transaction-safe final-seat enforcement.

### Changed

- Capacity greater than one currently uses solo-host assignment; round-robin
  and group event types retain one booking per time.

## [0.7.0] - 2026-07-23

### Added

- Organizer controls to add, remove, and resend poll invitations after poll
  creation, with delivery and reminder status in the dashboard.

### Changed

- Removing an invitation stops future reminders without deleting that person's
  submitted poll response.

## [0.6.0] - 2026-07-23

### Added

- Optional poll invite lists with initial invitation delivery and deduplicated
  reminders for unanswered invitees 24 hours and one hour before the deadline.

### Changed

- Poll response selections use softer green, amber, and red treatments.

## [0.5.0] - 2026-07-23

### Added

- Participant-specific poll finalization emails with calendar invitations for
  available and if-needed voters.
- Poll finalization delivery status, organizer resend controls, and signed
  `poll.finalized` webhooks.

## [0.4.0] - 2026-07-23

### Added

- Poll result-visibility modes, voting deadlines, participant limits, and
  organizer close/reopen controls.

### Changed

- Poll availability choices and result totals use accessible green, amber, and
  red status treatments.

## [0.3.0] - 2026-07-23

### Added

- Live public meeting-poll result matrices with automatic refresh.
- Temporary Google Calendar free/busy assessment for poll responders.

### Changed

- Poll voting is grouped chronologically with compact choices, explicit
  unanswered progress, and a mobile-friendly response bar.

## [0.2.0] - 2026-07-23

### Added

- Calendar-aware meeting poll suggestions from an organizer-selected date and
  daily time window.
- Fifteen-minute start grids for suggested and manually entered poll options.

## [0.1.0] - 2026-07-23

First tracked public release.

### Added

- Solo, round-robin, and group booking workflows.
- Google Calendar synchronization and booking write-through.
- Responsive organizer dashboard, booking themes, layouts, and white-label
  domains.
- Workspace tenancy, hosted namespaces, plans, user and team management.
- Routing forms, analytics, webhooks, MCP tools, and responsive embeds.
- Anonymous invitee calendar overlay with free/busy-only Google access.
- Account-free meeting polls with editable responses, ranked results, and
  organizer finalization.
- Duration-based poll creation with single-click candidate start entry.
- Optional professional titles on organizer profiles and public booking pages.

[0.1.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.1.0
[0.2.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.2.0
[0.3.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.3.0
[0.4.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.4.0
[0.5.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.5.0
[0.6.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.6.0
[0.7.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.7.0
[0.8.0]: https://github.com/e1i3or-commits/Calpaca/releases/tag/v0.8.0

# Changelog

Calpaca follows [Semantic Versioning](https://semver.org/). Releases are
tracked with annotated Git tags named `v<version>`.

## [Unreleased]

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

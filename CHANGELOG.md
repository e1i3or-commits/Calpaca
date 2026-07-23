# Changelog

Calpaca follows [Semantic Versioning](https://semver.org/). Releases are
tracked with annotated Git tags named `v<version>`.

## [Unreleased]

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

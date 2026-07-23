# Feature-parity roadmap

Research snapshot: 2026-07-23.

## Objective

Bring Calpaca to practical feature parity with Calendly, Cal.com, and Doodle
without losing its distinguishing constraints: a small Bun application,
PostgreSQL as the only required service, a pure scheduling core, excellent
time handling, self-hosting, and an API shared by every client.

“Parity” here means that a team evaluating the common scheduling jobs can
choose Calpaca without hitting a product-shaped dead end. It does **not** mean
copying every vendor-specific integration or enterprise sales feature.
Calpaca should cover the jobs directly and use webhooks/API adapters for the
long tail.

## Market baseline

### Calendly

Calendly's current baseline combines reusable one-on-one, group-capacity,
collective, and round-robin event types with connected calendars, configurable
availability, conferencing, routing forms, meeting polls, workflows,
analytics, managed events, embeds, payments, and organization administration.
Its newer Scheduling area also separates reusable event types, single-use
links, and meeting polls, and supports multiple durations on eligible event
types.

Sources:

- [Calendly features](https://calendly.com/features/)
- [Event type overview](https://help.calendly.com/hc/en-us/articles/4914418007831)
- [Scheduling page, single-use links, polls, and multiple durations](https://help.calendly.com/hc/en-us/articles/360022356594-Home-page-overview)
- [Workflows](https://help.calendly.com/hc/en-us/articles/360051017814-Automate-tasks-with-Workflows)
- [One-off meetings](https://help.calendly.com/hc/en-us/articles/14074838011543)
- [Admin dashboard](https://help.calendly.com/hc/en-us/articles/18522271511959-Calendly-s-admin-dashboard)

### Cal.com

Cal.com's strongest parity bar is configurability: personal, collective,
round-robin, and managed event types; recurring bookings; booking limits;
date overrides and out-of-office forwarding; workflows; payments; embeds;
and advanced routing. Its round-robin model includes fixed hosts, multiple
host groups, weights, priorities, and least-recently-booked assignment.
Advanced routing adds member attributes, weighted virtual queues, fallbacks,
headless forms, and an inspectable routing trace.

Sources:

- [Event types](https://cal.com/help/event-types/event-types)
- [Event-type settings, recurring events, and payments](https://cal.com/docs/platform/atoms/event-type)
- [Round-robin scheduling](https://cal.com/help/event-types/round-robin)
- [Routing overview](https://cal.com/help/routing/routing-overview)
- [Workflows](https://cal.com/help/workflows/workflowsoverview)
- [Date overrides](https://cal.com/help/availabilities/date-overrides)
- [Out of office](https://cal.com/help/availabilities/out-of-office)

### Doodle

Doodle's distinct parity bar is participant coordination rather than booking
links alone. It offers booking pages and curated one-off 1:1 invitations,
plus account-free group polls with yes / if-need-be / no voting, deadlines,
hidden participants, reminders, and finalization. Sign-up Sheets provide
predefined sessions, seat limits, per-person registration limits, custom
questions, and enrollment tracking.

Sources:

- [Doodle features](https://doodle.com/en/features/)
- [Group Poll introduction](https://help.doodle.com/en/articles/9823082-introduction-to-group-poll)
- [Group Poll participation](https://help.doodle.com/en/articles/9457279-how-do-i-participate-in-a-group-poll)
- [Poll deadlines, limits, reminders, and privacy](https://help.doodle.com/en/articles/9457346-how-do-i-set-a-deadline-limit-participants-send-automatic-reminders-or-make-my-group-poll-hidden)
- [Sign-up Sheet creation](https://help.doodle.com/en/articles/9457226-how-do-i-create-a-sign-up-sheet)
- [Booking Page creation](https://help.doodle.com/en/articles/9457322-how-do-i-create-a-booking-page)

## Current Calpaca position

| Capability | State | Competitive position |
| --- | --- | --- |
| Solo booking links | Shipped | Baseline parity |
| Collective/group host availability | Shipped | Parity, with distinctive quorum fallback |
| Weighted round robin | Shipped | Strong; transparent assignment is differentiated |
| Availability schedules, buffers, notice, daily caps | Shipped | Baseline parity |
| Scored “best times” | Shipped | Differentiated |
| Google Calendar sync and write-through | Shipped | Partial; one provider |
| Reschedule, cancel, reminders, no-show | Shipped | Baseline operational lifecycle |
| Routing forms | Shipped | Baseline rules, behind Cal.com's attribute routing |
| Booking questions | Shipped | Typed per-event fields with hidden prefill support |
| Workflows | Partial | Fixed reminders and webhooks, no user-authored automation |
| Webhooks and delivery log | Shipped | Strong extension boundary |
| Analytics | Dashboard and CSV shipped | Outcomes, lead time, no-shows, and round-robin balance are visible |
| Admin bookings | Shipped | List, detail, delivery state, no-show, and assignment explanation |
| Suggest a time | Shipped | Invitee form and organizer email notification |
| User management | Shipped | Invitations, owner/admin/member roles, and safe deactivation |
| MCP scheduling client | Shipped | Differentiated |
| Meeting polls | Shipped | Doodle/Calendly coordination parity |
| Capacity/group attendee events | v1 shipped | Shared solo-host sessions; waitlists remain |
| Sign-up sheets/session enrollment | Shipped | Fixed sessions with enrollment administration |
| One-off and single-use links | Missing | Common convenience gap |
| Recurring series | Missing | Common service/education gap |
| Date overrides and explicit OOO | Shipped | Alternate hours, ranges, and teammate forwarding |
| Microsoft/CalDAV calendars | Missing | Major adoption gap |
| Conferencing adapters | Missing | Google Meet is incidental to Google write-through |
| Payments | Missing | Commercial-use gap |
| Managed event templates | Missing | Team governance gap |
| SSO, SCIM, audit log, granular roles | Partial | Core roles and lifecycle shipped; enterprise controls missing |
| Embeds and documented public API | Shipped | Responsive loader and generated OpenAPI reference |

## Product principles for parity

1. **Job parity before checkbox parity.** Cover the scheduling outcome, not
   every incumbent's exact setting name.
2. **One event model, several participation modes.** Reuse lifecycle,
   notifications, tokens, webhooks, and analytics across appointments,
   capacity sessions, polls, and sign-up sheets.
3. **Postgres remains the platform.** pg-boss handles timers and retries;
   optional delivery providers may be configured, but no Redis or broker.
4. **Integrations are adapters, not a marketplace.** Maintain first-party
   calendar/conferencing adapters and send everything else through signed
   webhooks, n8n, Zapier-compatible hooks, or the public API.
5. **Mobile is a release gate.** Every organizer and invitee flow must work
   at 390px without a desktop-only management fallback.
6. **Privacy is visible.** Poll visibility, calendar health, delivery state,
   routing decisions, and assigned hosts must be explainable in the UI.

## Roadmap

The phases are dependency ordered. Effort is relative: S (small), M
(multi-surface), L (new domain), XL (new external sync/security surface).

### P0 — Finish the current product surface

Goal: expose capabilities already present in the API and remove launch
friction before adding new domains.

| Deliverable | Effort | Release gate |
| --- | ---: | --- |
| Admin bookings list/detail, delivery state, no-show, assignment explanation | Shipped | Visual and mobile review complete |
| Invitee “Suggest a different time” form | Shipped | Visual and mobile review complete |
| Analytics dashboard and CSV export over the four views | Shipped | Results match SQL views exactly |
| Generic deployment example, vendored AGPL text, issue templates | Shipped | Portable Compose setup documented |
| Embed v1: responsive iframe + small script launcher | Shipped | CSP, resize, and mobile checks complete |
| OpenAPI document and searchable reference | Shipped | Route and generated-document drift checks run in verification |

### P1 — Scheduling fundamentals parity

Goal: close the everyday gaps users encounter before team or enterprise
features matter.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| Date overrides and OOO ranges | Shipped | Unavailable/alternate hours, DST-safe ranges, and teammate forwarding |
| Multiple connected calendars | Shipped | Per-calendar conflict checking, health, and one write destination |
| Custom booking questions | Shipped | Text, textarea, select, multiselect, phone, checkbox; required/hidden |
| Locations | Shipped | In-person, phone, custom URL, Google Meet; per-host override |
| Multiple selectable durations | Shipped | Buffers, caps, holds, scoring, and rescheduling follow the selected duration |
| One-off offers and single-use links | M | Curated slots, optional reservation holds, viewed/booked/expired state |
| Availability troubleshooter | M | Explain why a time is unavailable without exposing private events |
| Email verification and abuse controls | S–M | Optional OTP for public bookings; retain rate limiting |

P1 exit: a solo professional can reproduce the normal Calendly/Cal.com
booking-link workflow, including exceptions and one-off scheduling, without
editing their external calendar as a workaround.

### Hosted platform foundation

Goal: operate Calpaca as a paid multi-tenant service without weakening the
self-hosted edition.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| Workspace tenancy and strict data scoping | Shipped | Event types, bookings, routing, webhooks, analytics, users, and teams are scoped |
| Hosted identity and domains | Shipped | Hosted booking/routing namespaces and canonical organizer origin are implemented |
| Custom domains | Shipped | TXT verification, hostname mapping, and optional NPM certificate provisioning |
| Plans and entitlements | Foundation shipped | Capability model exists; billing-driven plan changes remain |
| Billing lifecycle | L | Checkout, subscription state, grace period, cancellation, and audit trail |
| Self-hosted distribution | M | No billing dependency; installation, upgrades, backups, and environment reference |

This foundation lands before invitee calendar OAuth so consent, credentials,
retention, and billing all have an explicit workspace boundary.

### P2 — Communications and organizer operations

Goal: turn hard-coded lifecycle messaging into a coherent automation system.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| Workflow model: trigger → delay/condition → action | L | Snapshot workflow/version onto affected bookings |
| Email actions and reusable templates | M | Before/after, booked, rescheduled, cancelled, no-show |
| Internal notification and webhook actions | S | Reuse delivery log/retry machinery |
| Reconfirmation and follow-up links | M | Attendance confirmation and post-meeting calls to action |
| Optional SMS/WhatsApp provider adapter | M | Disabled unless configured; consent and unsubscribe required |
| Contacts and invitee history | M | Minimal relationship history, not a CRM |
| Bulk booking actions and CSV export | M | Scoped, audited, mobile-safe |

P2 exit: common reminders and follow-ups can be configured without n8n, while
complex integrations still leave through webhooks.

### P3 — Participant scheduling parity

Goal: cover Doodle's core coordination jobs and Calendly meeting polls.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| Optional invitee calendar overlay | Shipped | Consent-based busy/free only; mutual times rank first without hiding alternatives |
| Meeting polls | v1 shipped | Account-free voting; yes / if-needed / no; signed response editing and organizer finalization |
| Poll privacy and controls | v1 shipped | Result visibility, deadline, response editing, participant limits, close/reopen, invitations, and unanswered-invitee reminders |
| Calendar-aware voting | Shipped | Signed voter link; optional free/busy overlay, no invitee account requirement |
| Capacity event types | v1 shipped | Solo-host shared sessions, remaining-seat display, transaction-safe limits; waitlists remain |
| Sign-up sheets | v1 shipped | Named sessions, capacity, custom questions, per-person limits, confirmations, and public cancellation |
| Enrollment administration | Shipped | Roster, removal, export, resend, privacy controls, state, and safe capacity changes |
| Finalization notifications | Shipped | Participant-aware email/ICS delivery, status, resend, and signed webhook |

P3 exit: Calpaca can handle “find one time for this group,” “let many people
join this slot,” and “let people enroll across these sessions” as distinct,
clear flows.

### P4 — Team scale and routing depth

Goal: match the administrative and assignment controls expected by larger
teams.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| User directory and lifecycle | L | Invite, resend, status, deactivate/reactivate; preserve booking history |
| Managed event templates | L | Admin-owned template, assigned members, lockable fields |
| Team landing pages and grouped links | Partial | Workspace event catalogue shipped; team-specific catalogues and visibility controls remain |
| Roles and permissions | L | Owner, admin, team manager, member; capability-based checks |
| Fixed + rotating host pools | L | One required host plus one choice from each pool |
| Member attributes and skill routing | L | Language, region, specialty, department |
| Routing fallbacks and trace | M | Persist the complete decision, including no-match path |
| Team OOO administration and delegation | M | Coverage and forwarding visible to admins |
| Provisioning health dashboard | M | Missing calendar/location, sync health, pending invitations |

P4 exit: a sales, recruiting, or support organization can securely invite,
govern, deactivate, and organize its users; standardize event types; route
by fit; inspect the decision; and manage coverage.

### P5 — Calendar and meeting ecosystem

Goal: remove Google-only adoption blockers while keeping integrations narrow.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| Calendar provider interface and conformance suite | L | Extract Google behavior before adding providers |
| Microsoft 365 / Outlook calendar | XL | OAuth, delta sync, subscriptions, write-through |
| CalDAV read/write | XL | Standards vary; publish a tested compatibility matrix |
| Zoom and Microsoft Teams conferencing | L | Adapter creates/updates/deletes meeting links |
| Generic static/custom location adapters | S | Phone, physical, custom URL already modeled in P1 |
| Public API tokens and scoped service accounts | L | Rotation, last-used metadata, revocation |
| Webhook replay and test delivery | M | Operator tooling over existing delivery records |
| Native inline, popup, and floating-button embeds | M | Shared loader, accessible focus management |

P5 exit: Google and Microsoft organizations can adopt without calendar
workarounds, and developers have stable API/embed surfaces.

### P6 — Revenue, recurrence, and enterprise controls

Goal: cover high-value features that add meaningful lifecycle or security
complexity.

| Deliverable | Effort | Notes |
| --- | ---: | --- |
| Recurring booking series | L | Series identity, atomic availability, per-occurrence cancel/reschedule policy |
| Stripe payments | XL | Payment intent before confirmation, refunds, failure recovery, webhook idempotency |
| Deposits and cancellation policy | L | Build only after basic payments are proven |
| Organization audit log | M | Actor, action, target, timestamp, structured metadata |
| SAML/OIDC SSO | XL | Generic provider first |
| SCIM provisioning | XL | Users, teams, deactivation, idempotent reconciliation |
| Retention/export/delete controls | L | Privacy operations with event-log policy explicitly defined |
| Localization | L | UI, email, timezone copy, locale-aware formatting |
| Accessibility conformance | M | WCAG 2.2 AA audit and regression checks |

P6 exit: Calpaca is credible for paid services and security-reviewed
organizations, not merely feature-rich for small teams.

## Explicit non-goals and parity substitutes

| Incumbent capability | Calpaca approach |
| --- | --- |
| Hundreds of native SaaS integrations | Signed webhooks, public API, n8n/Zapier recipes; first-party adapters only for calendars, conferencing, and payments |
| Native video service | Create links through Meet/Zoom/Teams; do not operate media infrastructure |
| Full CRM | Contact/booking history plus routing metadata; CRM remains an integration |
| Native mobile applications | Responsive PWA-quality web UI first; native apps only if measured demand justifies a second client |
| AI meeting notetaker | External integration through webhook/API; outside scheduling core |
| Invitee calendar OAuth for polls | Optional later enhancement; account-free voting remains the primary Doodle-compatible flow |

## Cross-cutting acceptance gates

Every phase must preserve:

- DST-safe Temporal calculations and UTC storage.
- Transactional capacity/hold correctness under concurrent requests.
- API-first contracts with Zod validation and OpenAPI parity.
- Keyboard-complete, screen-reader-labeled, 390px mobile flows.
- Append-only domain events for every lifecycle-changing feature.
- Rate limiting and explicit privacy defaults on unauthenticated surfaces.
- No new infrastructure container without a documented budget exception.
- Migration, retry, webhook idempotency, and provider failure tests.

## Suggested next sequence

1. Complete Tasks 27 and 28 under the redesigned dashboard shell.
2. Deliver P0 analytics UI, embeds, and OpenAPI.
3. Implement P1 overrides/OOO, custom questions, locations, and one-off links.
4. Build the workflow model before polls so reminders/finalization reuse it.
5. Build polls, capacity events, and sign-up sheets on shared participation
   primitives.
6. Add team governance, then extract the calendar adapter interface before
   Microsoft work.

This order converts today's backend strengths into a coherent product first,
then adds the two largest new domains—automation and participant
coordination—before taking on external-provider and enterprise complexity.

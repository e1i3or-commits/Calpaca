# Engagement follow-up schedule

Implemented for franchise onboarding Engagements. A planned series is separate
from confirmed bookings. Unreserved dates remain drafts; reserved dates expose
booking and delivery status. See [issued follow-up changes](FOLLOWUP-CHANGES.md)
for the current reservation and calendar reconciliation behavior.

## Controls and recurrence

The Engagement overview now contains a follow-up schedule panel. Account leads
and workspace owners/admins can choose weekly, biweekly (the default), or monthly
cadence, the first future date, a local time, and an IANA timezone. The timezone
initially suggests the browser's zone and remains visible/editable. Six future
meetings are suggested, with an explicit limit of 12 per preview. Meetings are
45 minutes. The existing attendance plan remains four required Franchise Success
members and two optional leaders. Reservation and changes to issued dates
recheck required calendars in the booking transaction.

Monthly has two explicit patterns:

- **Same date:** preserve the original day number; use the last day of shorter
  months, returning to the original number when available.
- **Same weekday position:** use the first date's weekday position, such as
  second Tuesday. If the anchor is the last instance of its weekday in that
  month, use the last instance each month (including when that is the fourth).

Local wall-clock time survives DST changes. Ambiguous or nonexistent local times
block the preview with an actionable error instead of selecting an offset or
silently skipping a meeting. This uses Temporal's documented
[timezone disambiguation behavior](https://tc39.es/proposal-temporal/docs/timezone.html).
The 45-minute duration is elapsed time.

## Preview, save and history

Preview lists dates to create, move, keep, pause, resume or cancel. Saving
requires that exact preview's hash and current onboarding revision. The server
recomputes the preview under a lock, rejecting concurrent changes or dates that
have passed since review. No operation modifies a row whose start is at or
before the current time, including an in-progress meeting.

Future dates occupy stable positions with stable occurrence UUIDs. Cadence
changes reuse those UUIDs in position order. Moving an individual occurrence
marks it as an exception; later series edits preserve its instant and its
position, consuming that position in the generated plan. Exceptions beyond a
shortened planning horizon remain preserved. The UI explains this behavior.
Changing a timezone preserves exception instants; their displayed local time
may change. Overlapping future dates or overlap with an in-progress date block
saving. Cancelled rows remain in history; extending a shortened plan creates
new rows instead of reviving cancellations.

Past records and surrounding Engagement context are not deleted or rewritten.
These draft rows are not meeting notes or a claim that a meeting occurred.
They retain their original state when they pass into history.

Pause marks future drafts paused. Resume returns future paused rows to draft;
past rows stay unchanged. End cancels future rows and permanently ends this
schedule. Each action is previewed before saving. A paused, completed or
archived Engagement blocks schedule mutation. Automatic extension is implemented for enabled, planned schedules (FOLLOWUP-AUTOMATION.md). For enabled schedules, ending or pausing
queues verified cancellation of future booked calls; see FOLLOWUP-CHANGES.md.

## Database and API

Migration `0057_onboarding_followup_schedule.sql` adds:

- `onboarding_followup_schedules`: one rule and planned/paused/ended status per
  onboarding record.
- `onboarding_followup_occurrences`: stable position/UUID, exact start/end,
  draft/paused/cancelled state and exception marker.
- `onboarding_followup_changes`: actor, request ID, revision, reviewed input and
  applied change list, with unique request and revision constraints.

Save atomically updates the schedule, occurrence rows, shared onboarding cadence
and revision, Engagement timestamp, and both audit trails. Workspace/Engagement
locks use the existing cadence mutation order. Read/preview uses a shared
Engagement lock for a coherent snapshot. A failed audit write rolls everything
back. Replaying the same request recovers its applied revision and current
schedule without repeating changes; changed input with the same request ID is
rejected. Replay still checks current access and management permission.

| Method and path | Contract |
|---|---|
| `GET /api/me/engagements/:id/followup-schedule` | Existing Engagement read permissions; current revision, rule, all saved dates, management permission and `deliveryState: not_invited | reservations_present` |
| `POST .../followup-schedule/preview` | Lead/admin; `{revision, command}` returns changes, issues, canApply and previewHash |
| `POST .../followup-schedule/apply` | Same input plus UUID requestId and previewHash; revalidates and atomically saves |

Commands are `configure` with a rule, `move` with occurrenceId/date/time, or
`pause`, `resume`, `end`, or `extend` to maintain the saved future-date count. Input is strict: no workspace, duration, participant or
publication overrides. Generated OpenAPI contains the actual validators.
Responses are no-store. An inaccessible record returns 404, an unauthorized
mutation 403, invalid input 400, and revision/preview/request/lifecycle conflicts
409. Network uncertainty is recoverable by retrying the same save request.

The legacy preference-only cadence endpoint returns `schedule_preview_required`
when a saved schedule exists and its cadence would change. This prevents a
preference edit from leaving saved dates on the old cadence.

## Verification and remaining integration

Real PostgreSQL coverage includes concurrent saves/replays, workspace and role
isolation, stale previews, exact-history/ID preservation, individual exceptions,
pause/resume/end, closed Engagements and forced audit rollback. Core tests cover
both DST transitions, DST gaps/folds, month-end/leap-year/weekday patterns,
overlap, past anchors and strict bounded inputs. API tests verify authentication,
scoping and mutation contracts. No external effects are used in tests.

Occurrence reservation, optional attendance and issued-meeting changes are now
built. Controlled franchisee agreement/activation, real delivery feedback,
independent alerts and the n8n/Tyger adapter remain. Automatic extension is now handled by the Calpaca scheduler. Draft configuration alone never establishes readiness.

Verification on 2026-09-11: all 816 tests passed against local PostgreSQL, with
TypeScript, lint, generated OpenAPI parity and repository invariants passing.
The web build passed with the existing large-chunk advisory. Local Chrome
verified biweekly creation, weekly/monthly changes, an individual exception,
pause/resume/end and reload persistence, with light/dark visual inspection.
The local review database retained six occurrences and one exception while
creating zero bookings and zero delivery operations. Temporary review tooling
is excluded from the committed application.

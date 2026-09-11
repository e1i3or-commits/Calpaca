# Protected onboarding follow-up reservations

A private follow-up conversation retains four required Franchise Success members
and two optional leadership members. Its organizer is the initially configured
Franchise Success account lead, even when leadership organizes the kickoff.
Only the four required hosts constrain availability; all six active accounts
receive invitations with their specified attendance roles.

Administrator APIs (session or personal access token, workspace scoped):

- `POST /api/automation/followup-reservations/:engagementId` with `{}` prepares
  or recovers the private conversation. It does not enable invitations.
- `GET` at the same path returns reservation state, assigned issues and counts.
- `POST /api/automation/followup-reservations/:engagementId/:occurrenceId/reserve`
  accepts only `{revision}`. A successful reservation returns its booking ID;
  replay returns that same ID. A blocked attempt returns an assigned issue.

Reservations require an enabled binding, approved current plan revision, a
confirmed kickoff with delivered invitations, an active Engagement, correct
protected conversation settings, and the exact saved future occurrence. Fresh
required calendars, availability, competing bookings and live holds are checked
under canonical host locks. Booking, occurrence binding, event and delivery
outbox commit atomically. Database failure within the booking savepoint leaves
an assigned failure without a partial booking. The health endpoint at
`/api/automation/kickoff-deliveries` includes uncapped reservation failures in
`attention` and separately in `reservationAttention`.

The existing durable dispatcher handles these invitations and requires all
recipients' delivery receipts. Follow-up preflight rechecks the plan, kickoff
and required availability before provider calls. Google readback checks optional
flags, and secondary organizing calendars still invite the human organizer.
ICS serializes optional participation explicitly. Follow-ups remain inaccessible
through public booking lookup, holds and generic change/cancellation operations.
Email omits public management links for this managed schedule.

Reviewed schedule changes now reconcile booked dates, cancellations and resumed
booking generations; see [FOLLOWUP-CHANGES.md](FOLLOWUP-CHANGES.md). Generic
Engagement status changes remain blocked while confirmed future calls exist;
pause/end the schedule first so those invitations receive cancellations.

Migration 0058 adds private conversation bindings, reservations and their audit.
There is no activation API in this milestone. Synthetic PostgreSQL tests set
private activation/source delivery fixtures directly; production callers cannot.
Controlled agreement/publication, provider feedback binding, independent monitor
activation, automatic extension remain to implement.
No production booking, invitation or provider resource was created by this build.

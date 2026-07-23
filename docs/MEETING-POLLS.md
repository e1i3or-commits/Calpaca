# Meeting polls

Meeting Polls v1 covers the account-free group coordination flow:

1. An entitled organizer creates a poll with 2–20 future candidate times.
2. Calpaca provides an opaque public `/poll/<id>` link.
3. Participants vote **Yes**, **If needed**, or **No** for every option.
4. The first response returns a high-entropy edit capability stored by the
   browser. Calpaca stores only its SHA-256 hash.
5. Results rank by most Yes votes, then most If-needed votes, then fewest No
   votes, with a deterministic final tie-break.
6. The organizer finalizes one option, closing further voting.

Polls are workspace-scoped and governed by the `meetingPolls` plan
entitlement. Public IDs are random and participant edit tokens are never
returned in organizer results.

Organizers can set privacy controls, a voting deadline, participant limits,
and an optional invite list. Invited people receive the poll link, and
unanswered invitees can receive deduplicated reminders 24 hours and one hour
before the deadline. Organizers can add or remove invitees after creation and
resend an invitation; removing an invite stops its reminders but retains any
submitted response. Calendar-aware voting and multi-recipient finalization
notifications are also supported.

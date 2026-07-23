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

Privacy controls, deadlines/reminders, calendar-aware voting, and
multi-recipient finalization notifications are subsequent roadmap items.

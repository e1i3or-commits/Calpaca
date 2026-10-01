# Engagement meetings

The Meetings tab puts one-off booking, follow-up dates and invitation status before team and calendar setup. Meeting templates remain a separate tab. Past and cancelled follow-ups and detailed setup are collapsed by default.

## Book an additional call

Franchise Success members assigned by the onboarding plan, the account lead and workspace administrators can select **Book a one-off meeting**. Set a title, a duration from 15 to 180 minutes in five-minute increments, and mark engagement teammates required, optional or not attending. The account lead stays required as the organizer. Choose an available time on the booking page, enter the client details and confirm to send invitations.

Preparing a call does not send invitations. Its saved link appears under One-off meetings so preparation can be resumed. Required attendees' calendars are checked again at confirmation. Optional attendees receive invitations without blocking the time. Each prepared call permits one confirmed booking, with normal cancellation and rescheduling links.

These calls are explicitly linked to the onboarding and use the existing durable calendar/email delivery flow. After a call ends, the meeting-notes worker checks it after the same twenty-minute settling period as follow-ups. Gemini notes, when available, go to the existing Tyger suggestion review and Slack notification flow. A call does not guarantee that Gemini notes were recorded.

## Extend follow-ups

Choose the number of additional meetings and **Extend follow-ups**, inspect the proposed dates, then save. Existing dates and individual moves stay unchanged. An active cadence automatically checks availability, books eligible dates and sends tracked invitations. Dates outside calendar coverage remain planned until they enter the booking window. The rolling future-date target remains unchanged.

**Review invitations** jumps to the invitation controls. If invitations have not been enabled, review the saved dates and use **Start automatic booking and invitations**. A planned date is not a delivered invitation; the meeting list shows the distinction and any booking issues.

## Implementation and verification

One-off bindings in `onboarding_one_offs` preserve the original creator, request ID, duration and roster. Preparation is idempotent and scoped to the workspace and onboarding. Generic event editing cannot silently change a protected roster. Booking uses the existing host locks, calendar guard and delivery queue. Only explicit one-off bindings and follow-up reservations enter the notes queue.

Synthetic PostgreSQL tests cover replay/concurrency, access, custom duration, optional attendance, calendar readiness, protected confirmation, durable delivery and notes discovery. Browser fixtures cover desktop/mobile rendering and schedule preview without sending invitations. Help: it@tourscale.com.

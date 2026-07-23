# Invitee calendar overlay

Entitled booking pages can offer an optional Google Calendar connection. The
overlay ranks mutually available times first while preserving every normal
host-available time.

## Privacy model

- No Calpaca account is required.
- OAuth requests only Google's `calendar.events.freebusy` scope.
- Calpaca queries the primary calendar for free/busy ranges, then discards the
  access token immediately.
- The database retains only busy interval boundaries and hashes of random
  state/capability tokens. It does not retain event titles, attendees, Google
  credentials, or the raw capability.
- Pending OAuth state expires after 10 minutes. A connected overlay expires
  after one hour and can be disconnected sooner.
- The callback returns the capability in the booking URL fragment. Booking
  JavaScript moves it to tab-scoped `sessionStorage` and removes the fragment,
  preventing it from entering server logs or referrer headers.

## Google OAuth setup

Add this exact authorized redirect URI to the existing Google web client:

```text
https://app.calpaca.io/api/invitee-calendar/callback
```

Self-hosted installations use
`${BETTER_AUTH_URL}/api/invitee-calendar/callback` by default. Set
`INVITEE_CALENDAR_CALLBACK_URL` only when the canonical callback origin must
differ.

The feature uses the existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
Hosted access is controlled by the workspace `inviteeCalendarOverlay`
entitlement.

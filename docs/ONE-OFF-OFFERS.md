# One-off offers

One-off offers let an organizer send a short list of exact meeting times
without changing an event type's normal availability. The link can produce
one booking only.

## Organizer flow

Open **One-off offers** in the dashboard setup navigation, choose an event
type and duration, add up to 20 exact start times, and set an expiry. An
optional email restriction makes the offer bookable only by that recipient.
The organizer can copy or revoke an active link.

## Invitee flow

Public links use `/offer/<public-id>`. The page inherits the event type's
theme, profile, locations, and booking questions, but displays only the
curated times. Normal availability is rechecked when the invitee creates a
hold, so a time that became busy cannot be booked.

## Single-use guarantee

Final confirmation locks the offer row in the same PostgreSQL transaction
that creates the booking and appends its booking event. The transaction
validates the event type, exact slot, expiry, recipient restriction, and
active state before marking the offer booked. Concurrent confirmations
therefore cannot redeem the same link twice.

Revoked, expired, and booked links retain their history but no longer accept
holds or confirmations.

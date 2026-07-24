# Booking email verification

Event types can require invitees to verify their email before a booking is
confirmed. Enable **Verify invitee email before booking** in the event type
editor. Existing event types remain unchanged until the setting is enabled.

## Invitee flow

After completing the booking form, the invitee receives a six-digit code.
Codes expire after 10 minutes, accept no more than five failed attempts, and
become unusable immediately after successful verification. Confirmation
requires a receipt scoped to the event type and normalized invitee email.

A successful verification stores a browser receipt for 30 days. The receipt
is HMAC-hashed in PostgreSQL and cannot verify another address or event type.
Clearing browser storage removes this convenience.

## Abuse and privacy controls

- Code requests are limited by IP and to one delivery per normalized address
  per minute.
- Request responses are generic whether or not a matching verification flow
  exists, preventing address and event discovery through response content.
- Codes and browser receipts are never stored in plaintext.
- The verification endpoint returns the same error for expired, exhausted,
  unknown, and incorrect codes.

SMTP must be configured for enabled event types. `EMAIL_VERIFICATION_SECRET`
should be set to a stable private value; the application authentication secret
is used as the fallback. `EMAIL_VERIFICATION_RATE_LIMIT` controls the default
five-request-per-minute IP limit.

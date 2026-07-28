# Invitee-added guests

Status: accepted design, not yet implemented. Written before the code so the
implementation has something to be checked against.

An event type may let the person booking it add other people to the meeting.
The toggle is `guestsEnabled` and it is off by default, so no existing booking
page changes behaviour until an organizer turns it on.

A guest becomes a real attendee. They are added to the Google Calendar event,
which means Google sends its own invitation with RSVP buttons and the meeting
lands on the guest's calendar. They are also copied on the Calpaca
confirmation, reschedule, and cancellation email, and they appear as an
`ATTENDEE` line in the ICS attachment used on the no-Google fallback path.

At most ten guests may be added. The limit is `MAX_GUESTS` in
`src/core/booking/guests.ts` rather than a per-event-type column: a public form
that fans out unbounded mail from `noreply@calpaca.io` is a deliverability
risk, and one tested constant is cheaper than a column, a Zod field, a form
input, and a number every organizer has to think about.

Guests do not consume capacity and cannot cause a double booking. The
uniqueness guarantee is a partial index on `(host_user_id, slot_start)`, and a
guest is never a host.

## Data model

```
event_types.guests_enabled  boolean not null default false
bookings.guest_emails       jsonb   not null default '[]'   -- string[]
```

Migration `0049`, additive only and with no backfill, so it is safe to apply
ahead of the code that reads it.

The `created` booking event gains `guestEmails`, and the key must be
whitelisted in both `serializePayload` and `deserializeEvent`
(`src/db/booking-repo.ts`). A key that is passed to `appendEvent` but missing
from `serializePayload` is dropped without an error — `meeting` is already in
that state today, harmlessly, because its contents are decomposed onto the
projection row instead. Guests would not be harmless, because the row is the
only other place they live.

## Validation

`src/core/booking/guests.ts` is pure and owns every rule:

```ts
export const MAX_GUESTS = 10;

export function parseGuestEmails(
  raw: readonly string[],
  inviteeEmail: string,
  hostEmails: readonly string[],
): Result<string[], GuestListError>
```

It trims, lowercases, and dedupes; drops the invitee's own address and any host
address, since both are already attendees and a repeat produces a duplicate
Google attendee; rejects malformed addresses; and rejects more than
`MAX_GUESTS`. It returns a typed `Result` and never throws.

Normalizing in one pure function is the reason the three fan-out sites can
simply concatenate the list without parsing anything.

## Request path

`bookingBodySchema` in `src/api/routes/bookings.ts` gains a top-level
`guests: z.array(z.string().email()).max(MAX_GUESTS).default([])`. It sits
beside `invitee` rather than inside it, because `invitee` is one person's
identity.

The route enforces two things a client cannot be trusted with:

- guests submitted for an event type whose `guestsEnabled` is false is
  `400 guests_not_allowed`. Without this check the toggle is decorative,
  because the endpoint is public.
- a `parseGuestEmails` failure is `400 invalid_guests`.

Both run before the hold is confirmed, so a rejected list writes nothing.

## Fan-out

Three lists gain the same validated addresses:

| Site | Change |
| --- | --- |
| `buildMail` in `src/jobs/invite-email.ts` | append guests to `cc` |
| `syncGoogleEvent` in `src/jobs/invite-email.ts` | append `{ email }` per guest to the Google `attendees` array |
| the `buildIcs` call in `src/jobs/invite-email.ts` | append `{ name: email, email }` per guest to `attendees` |

A guest supplies only an address, and `IcsPerson.name` is required and
interpolated straight into `CN=`, so passing an empty string would emit a bare
`CN=;` parameter. The address is used as the common name instead, which is what
most clients display for an unnamed attendee anyway.

`sendUpdates=all` is already set on every Google write in `src/sync/google.ts`,
so guests receive Google's native invitation with no change there.

Google shows the full attendee list to every attendee. Two guests can therefore
see each other's address, and all of them can see the hosts. This is the
default and it stays: `guestsCanSeeOtherGuests: false` would also hide the host
list from the invitee, which is worse. Calendly behaves the same way.

## Rescheduling and cancelling

Both work without additional code, which is the payoff of storing guests on the
booking row rather than deriving them per send.

`patchEventTime` sends only `{ start, end }`, so Google keeps the attendee list
across a reschedule, and the reschedule email copies guests because they are on
the row. `deleteEvent` uses `sendUpdates=all`, so a cancellation removes the
event from each guest's calendar, and the cancellation email copies them too.

Guests cannot reschedule or cancel. The tokens belong to the invitee and no
per-guest link is ever generated.

## Organizer configuration

`guestsEnabled` follows the path `emailVerificationRequired` already takes:
`src/db/schema.ts`, then `src/db/admin-repo.ts` (the `AdminEventType`
interface, `toAdminEventType`, `EventTypeInput`, and the `updateEventType` set
clause), the `eventTypeBodySchema` in `src/api/routes/admin.ts`,
`src/db/availability-repo.ts` (`EventTypeConfig`, `BookingEventTypeConfig`, and
both mappers), the public event-type response in `src/api/routes/availability.ts`,
the `EventTypeMeta` and `AdminEventType` types in `web/src/lib/api.ts`, and
finally `web/src/pages/dashboard-page.tsx` (`DEFAULT_EVENT_TYPE`,
`eventTypeToInput`, `EVENT_TYPE_SECTION_FOR_FIELD`, and a checkbox in the
Invitee form disclosure).

## Booking form

Under the email field, a collapsed `+ Add guests` control appears only when the
event type allows it. Expanding it reveals a list of email inputs with add and
remove affordances, capped at ten, with the remaining count shown as that cap
approaches. Client-side validation is a courtesy; the server revalidates.

## Failure handling

A guest must never cost the invitee their booking. Validation happens before
confirmation, so a bad list fails cleanly with nothing written, and because
addresses are syntactically validated there, the transport is never handed
something it would reject outright.

After confirmation a guest mailbox that does not exist bounces
asynchronously, which does not affect delivery to the invitee and already flows
through the email-delivery webhook.

Confirmed during implementation: a recipient our validation accepts but the
provider rejects at SMTP time (RCPT TO) does **not** fail the whole message.
`SendResult.rejected` in `src/notifications/mailer.ts` is documented as "the
recipients the SMTP server refused at handoff... while still accepting the
message for the rest," and `sendInviteMail`'s doc comment states per-recipient
rejections do not throw. `sendInvite` in `src/jobs/invite-email.ts` passes
`result.rejected` to `recordInviteeRejection`, which returns early when
`rejected` is empty and, when it is not, only treats the send as failed
(`invite_failed`) when the invitee's own address is among the rejected
recipients; a rejected guest or host cc is only `console.warn`ed. A single bad
guest address therefore cannot cost the invitee their confirmation email, and
no second `sendMail` call is needed.

## Tests

`tests/core/booking/guests.test.ts` carries the real coverage: deduplication,
case folding, invitee and host exclusion, the cap boundary, and malformed
input.

`tests/api/bookings.test.ts` gains `guests_not_allowed` when the toggle is off,
`invalid_guests` for a bad address, and a happy path asserting the list
persists.

`tests/core/invite/ics.test.ts` gains an assertion that each guest produces one
`ATTENDEE` line.

`tests/jobs/invite-email.test.ts` is new. Nothing currently asserts how
`buildMail` assembles `to`, `cc`, and `replyTo`, which is exactly the code
guests change.

## Out of scope

Organizer-added guests, editing guests after a booking exists, reading RSVP
state back from Google, and guests on polls, proposals, or sign-up sheets.

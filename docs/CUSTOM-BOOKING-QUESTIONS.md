# Custom booking questions

Each event type may define up to 20 structured questions:

- short text, long text, phone, checkbox, select, and multiselect;
- required or optional responses;
- up to 50 options for select controls; and
- hidden fields populated through booking-page query parameters or API input.

Question identifiers are stable, kebab-case keys. Changing a label does not
change previously stored answer keys. The booking API validates required
answers, types, option membership, unknown keys, and size limits against the
saved event type; clients cannot bypass the organizer's form rules.

Answers are stored on the booking projection and its append-only `created`
event. They appear in organizer booking details, confirmation email and
calendar descriptions, webhook payloads, and API booking detail responses.

Hidden questions are omitted from the rendered form. To prefill one on a
public link, add its identifier as a query parameter, for example
`/book/intro?campaign=summer`. API clients send hidden values in
`bookingAnswers` like any other answer.

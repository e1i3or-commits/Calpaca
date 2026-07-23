# Sign-up sheets

Sign-up sheets handle fixed, organizer-defined sessions rather than recurring
booking availability. An organizer can:

- publish up to 100 named sessions with independent times and capacities;
- allow each person to select one or more sessions up to a configured limit;
- collect up to 20 optional or required text responses;
- copy a public `/signup/<id>` link;
- review live session rosters and confirmation-delivery status;
- close and reopen enrollment;
- choose whether public pages hide enrollment, show counts, or show attendee
  names;
- cancel an attendee or resend their confirmation; and
- export the complete roster and custom answers as CSV.

Public registration is account-free and rate-limited. Capacity and per-person
limits are checked inside a PostgreSQL transaction that locks the sheet and
selected sessions, preventing concurrent enrollment beyond the final seat.

Each selected session receives its own confirmation email and calendar
invitation. A shared cancellation link cancels every session selected in that
registration action and immediately releases those seats.

Organizers may change session capacity after publishing. Reducing capacity
below active enrollment never removes attendees; the session is marked over
capacity and rejects new registrations until enough seats are available.

Waitlists remain later roadmap work.

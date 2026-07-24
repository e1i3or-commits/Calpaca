# Availability troubleshooter

The organizer-only troubleshooter explains whether a proposed time can be
booked for an event type. It uses the same schedules, overrides, calendar busy
cache, existing bookings, buffers, minimum notice, rolling window, capacity,
and team host roles used by the booking flow.

Open **Troubleshooter** in the dashboard setup navigation, choose an event
type, local start time, and allowed duration, then run the check. Results show
each configured host and one actionable category:

- available;
- missing schedule;
- outside recurring working hours;
- blocked by time off or a date override;
- calendar or existing-booking conflict;
- minimum notice;
- rolling booking window; or
- a required buffer extending outside working hours.
- available through configured teammate coverage.

For round-robin and solo links, one available host makes the proposed time
bookable. For group links, every required host must be available; optional
hosts are reported but do not block the time.

The API never returns calendar event titles, descriptions, attendees, or
providers. Busy data is reduced to the generic conflict category.

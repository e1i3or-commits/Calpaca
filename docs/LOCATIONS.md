# Locations

Event types may offer up to 20 labeled locations:

- Google Meet, created through the existing Google Calendar write-through;
- phone calls, with either the organizer or invitee designated as caller;
- in-person locations with an address and instructions; and
- custom HTTPS meeting links.

Team event types may override the address, URL, phone number, instructions,
or label for each assigned host. The override is resolved only after the
final host is selected, then stored as a booking snapshot. Later edits to an
event type do not rewrite historical booking details.

Public metadata never exposes the per-host override map. The selected and
resolved location appears in organizer booking details, confirmation email,
Google Calendar or ICS data, webhook payloads, and booking CSV exports.

Existing event types with only the legacy `meetingFormats` setting continue
to produce equivalent Google Meet and phone choices. New organizer edits use
the richer `locations` model.

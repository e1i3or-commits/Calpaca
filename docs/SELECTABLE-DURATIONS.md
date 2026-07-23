# Selectable durations and booking pages

An event type keeps `durationMinutes` as its default and may add up to twelve
unique `selectableDurations` between 5 and 480 minutes. The default must be in
that list. Event types without the new field continue to offer only their
existing duration.

Invitees choose a duration before loading availability. The API validates the
choice both when computing slots and when creating a hold. The hold and booking
store exact start and end instants, so notifications, calendars, analytics,
capacity, and buffers naturally use the chosen length. Rescheduling preserves
the original booking duration.

Every workspace also has a public catalogue:

- `/booking` on a custom or self-hosted domain
- `/booking/<workspace-slug>` on the hosted service

The catalogue lists the workspace event types and links to their normal booking
flows. Organizers can copy its URL from the Event types dashboard.

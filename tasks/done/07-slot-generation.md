# Task 07: Slot generation (pure)

## Goal
Candidate slots from open intervals + event type config.

## Spec
- `src/core/availability/slots.ts`: generateSlots(open, config, now) where
  config carries durationMinutes, bufferBeforeMin, bufferAfterMin,
  minimumNoticeMin, rollingWindowDays, maxPerDay, slotIncrementMin
  (default 15). Returns candidate slots (UTC intervals).
- Rules: a slot fits only if slot+buffers fits inside an open interval;
  slots before now+minimumNotice are excluded; slots beyond now+rollingWindow
  are excluded; maxPerDay counts in the EVENT TYPE's declared timezone
  (config.timezone), not UTC.
- Tests: buffer collisions at interval edges, notice boundary exactness
  (slot at exactly now+notice is included), rolling window end mid-day,
  maxPerDay across a UTC-date boundary in a non-UTC zone, increment
  alignment.

## Acceptance
```
bun run verify
```

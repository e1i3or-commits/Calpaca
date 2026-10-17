// Minimal Node (ESM + TypeScript) consumer of @calpaca/core.
// Run: npm install && npm start   (tsx), or npm run build && node dist/main.js
import {
  Temporal,
  assign,
  evaluateRouting,
  expandRules,
  generateSlots,
  mapEventToBusyChange,
  rankPollOptions,
  subtract,
  type Interval,
  type WeeklyRule,
} from "@calpaca/core";

const timezone = "America/New_York";
const now = Temporal.Instant.from("2027-03-08T12:00:00Z");
const window: Interval = { start: now, end: now.add({ hours: 24 * 7 }) };

// 1. Working hours -> open intervals (DST-safe, expanded in the host's zone).
const rules: WeeklyRule[] = [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" }));
const open = expandRules(rules, timezone, window);

// 2. Calendar events -> busy intervals (pure mapping of a Google event).
const change = mapEventToBusyChange(
  {
    id: "evt-1",
    status: "confirmed",
    start: { dateTime: "2027-03-09T10:00:00-05:00" },
    end: { dateTime: "2027-03-09T11:30:00-05:00" },
  },
  timezone,
);
const busy: Interval[] =
  change?.kind === "upsert"
    ? [
        {
          start: Temporal.Instant.fromEpochMilliseconds(change.startsAt.getTime()),
          end: Temporal.Instant.fromEpochMilliseconds(change.endsAt.getTime()),
        },
      ]
    : [];

// 3. Open minus busy -> bookable slots for a 30-minute event type.
const slots = generateSlots(
  subtract(open, busy),
  {
    durationMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 10,
    minimumNoticeMin: 60,
    rollingWindowDays: 14,
    maxPerDay: 6,
    timezone,
  },
  now,
);
console.log(`${slots.length} slots; first: ${slots[0]?.start.toZonedDateTimeISO(timezone).toString()}`);

// 4. Round-robin: pick the least-loaded host for the first slot.
const first = slots[0];
if (first) {
  const host = assign(
    first,
    [
      { userId: "ana", weight: 1 },
      { userId: "ben", weight: 1 },
    ],
    [{ userId: "ana", bookedAt: now.subtract({ hours: 2 }) }],
  );
  console.log(`assigned to ${host}`);
}

// 5. Routing and poll tallying.
const match = evaluateRouting(
  [
    {
      id: "enterprise",
      priority: 1,
      condition: { kind: "eq", field: "size", value: "enterprise" },
      targetEventTypeId: "et-sales",
      targetHostUserId: null,
    },
    { id: "default", priority: 9, condition: { kind: "always" }, targetEventTypeId: "et-intro", targetHostUserId: null },
  ],
  { size: "enterprise" },
);
console.log(`routed to ${match?.targetEventTypeId}`);

const [best] = rankPollOptions([
  { optionId: "tue", yes: 3, ifNeeded: 1, no: 0 },
  { optionId: "wed", yes: 3, ifNeeded: 2, no: 0 },
]);
console.log(`poll winner: ${best?.optionId}`);

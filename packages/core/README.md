# @calpaca/core

The scheduling engine behind [Calpaca](../../README.md), as a standalone
TypeScript package. It is pure: no database, network, clock or filesystem
access. Every function takes plain data (Temporal instants, weekly rules, busy
intervals, answers, histories) and returns plain data, so the same code runs
in Bun, Node and the browser, and is easy to test.

Licensed under the GNU AGPL v3 (see [LICENSE](LICENSE)), like the rest of
Calpaca.

## What is in it

| Area | Main exports |
| --- | --- |
| Interval math | `Interval`, `normalize`, `subtract`, `intersectMany`, `clamp` |
| Working hours | `WeeklyRule`, `expandRules`, `ScheduleOverride`, `effectiveOpenIntervals`, `forwardingIntervals` |
| Slot generation | `SlotConfig`, `generateSlots` (buffers, notice, rolling window, per-day caps, DST-safe grid) |
| Scoring and ranking | `scoreSlots`, `fragmentationPenalty`, `adjacencyBonus`, `timeOfDay`, `focusBlockPenalty`, `rankByMutualAvailability` |
| Team availability | `groupAvailability`, `teamAvailability`, `suggestOpenSlots`, `suggestionWindow` |
| Diagnostics | `diagnoseHostAvailability`, `HostSchedule`, `recommendationProvenance`, `confidenceFromEvidence` |
| Round robin | `assign`, `explainAssignment`, `buildAssignmentExplanation` |
| Booking rules | `allowedDurations`, `isAllowedDuration`, `parseGuestEmails`, `guestsToInvite`, `validateBookingAnswers`, `resolveBookingLocation` |
| Booking lifecycle | `applyEvent`, `projectState` (event-sourced state machine), `BookingStateError<R>` |
| Routing forms | `evaluateCondition`, `evaluateRouting`, `validateAnswers` |
| Polls | `rankPollOptions` |
| Proposals | `transitionProposal`, `effectiveProposalStatus`, `canEditProposal` |
| Calendar sync | `mapEventToBusyChange` (Google event to busy-cache upsert or delete) |
| Helpers | `Result`, `ok`, `err`, `isOk`, `isErr`, `map`, `andThen`, `unwrapOr`, `isIanaZone`, `Temporal` |

Everything is exported from the package root. Times are
`Temporal.Instant` values from `@js-temporal/polyfill`. Use the `Temporal`
that `@calpaca/core` re-exports so your values and the engine share one
polyfill copy.

## Example

```ts
import { Temporal, expandRules, generateSlots, subtract, type Interval } from "@calpaca/core";

const timezone = "America/New_York";
const now = Temporal.Now.instant();
const window: Interval = { start: now, end: now.add({ hours: 24 * 14 }) };

const open = expandRules(
  [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" })),
  timezone,
  window,
);
const busy: Interval[] = []; // from your calendar cache
const slots = generateSlots(subtract(open, busy), {
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minimumNoticeMin: 60,
  rollingWindowDays: 14,
  timezone,
}, now);
```

A complete Node consumer (ESM, `moduleResolution: NodeNext`, run with `tsx` or
compiled with `tsc`) lives in [examples/node-consumer](examples/node-consumer).

## Using it

- **Bun, inside this repository:** the workspace resolves `@calpaca/core` to
  `src/index.ts` through the `bun` export condition, so no build is needed.
- **Node or bundlers:** build once (`bun run build` here, which runs `tsc`),
  then import the ESM output in `dist/` with its `.d.ts` types.
  Node 18 or later.
- **From another repository before an npm release:** depend on a packed
  tarball (`npm pack` in this directory) or a git/file path. The package is
  not published to npm yet.

## Development

```sh
bun test test          # the engine's own test suite
bun run typecheck      # src and tests, NodeNext resolution
bun run build          # dist/ (ESM + declarations + source maps)
```

From the repository root, `bun run verify` typechecks, lints and tests the app
and this package together.

## Boundaries

The package must stay free of I/O and of app concerns. Storage adapters,
HTTP, email, job queues and Google API calls stay in the Calpaca app. Calpaca's
product-specific rules (for example its onboarding and kickoff guards) layer on
top: `BookingStateError<R>` lets the app widen the engine's error reasons
without the engine knowing about them.

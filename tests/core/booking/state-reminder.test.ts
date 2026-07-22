import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { applyEvent, projectState, type BookingEvent, type BookingState } from "../../../src/core/booking/state";

/**
 * reminder_sent transitions. Split from state.test.ts because the kind
 * arrived with the reminder job (after the original state-machine task);
 * same conventions, same module under test.
 */

const startsAt = Temporal.Instant.from("2026-08-01T10:00:00Z");
const endsAt = Temporal.Instant.from("2026-08-01T10:30:00Z");

const created: BookingEvent = {
  kind: "created",
  payload: { startsAt, endsAt, hostUserIds: ["host-1"] },
};

function confirmedState(): BookingState {
  const result = applyEvent(null, created);
  if (!result.ok) throw new Error("fixture: created event rejected");
  return result.value;
}

describe("reminder_sent", () => {
  test("is legal on a confirmed booking and leaves the state unchanged", () => {
    const state = confirmedState();
    const result = applyEvent(state, { kind: "reminder_sent", payload: {} });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(state);
  });

  test("is illegal before the booking exists", () => {
    const result = applyEvent(null, { kind: "reminder_sent", payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("not_created");
  });

  test("is illegal on a cancelled booking", () => {
    const cancelled = applyEvent(confirmedState(), { kind: "cancelled", payload: {} });
    if (!cancelled.ok) throw new Error("fixture: cancel rejected");
    const result = applyEvent(cancelled.value, { kind: "reminder_sent", payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("booking_cancelled");
  });

  test("is illegal on a no-show booking", () => {
    const noShow = applyEvent(confirmedState(), { kind: "no_show", payload: {} });
    if (!noShow.ok) throw new Error("fixture: no_show rejected");
    const result = applyEvent(noShow.value, { kind: "reminder_sent", payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("booking_no_show");
  });

  test("a history containing reminders folds to the same state as one without", () => {
    const withReminder = projectState([
      created,
      { kind: "reminder_sent", payload: {} },
      { kind: "rescheduled", payload: { startsAt: endsAt, endsAt: endsAt.add({ minutes: 30 }) } },
      { kind: "reminder_sent", payload: {} },
    ]);
    const without = projectState([
      created,
      { kind: "rescheduled", payload: { startsAt: endsAt, endsAt: endsAt.add({ minutes: 30 }) } },
    ]);
    expect(withReminder.ok).toBe(true);
    expect(without.ok).toBe(true);
    if (withReminder.ok && without.ok) expect(withReminder.value).toEqual(without.value);
  });
});

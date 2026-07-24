import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { diagnoseHostAvailability } from "../../../src/core/availability/troubleshoot";

const now = Temporal.Instant.from("2027-05-01T12:00:00Z");
const slot = {
  start: Temporal.Instant.from("2027-05-03T14:00:00Z"),
  end: Temporal.Instant.from("2027-05-03T14:30:00Z"),
};
const schedule = {
  userId: "host",
  timezone: "UTC",
  rules: [{ dow: 1, start: "09:00", end: "17:00" }],
  overrides: [],
} as const;

function diagnose(overrides: Partial<Parameters<typeof diagnoseHostAvailability>[0]> = {}) {
  return diagnoseHostAvailability({
    userId: "host",
    schedule,
    busy: [],
    slot,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minimumNoticeMin: 0,
    rollingWindowDays: 14,
    now,
    ...overrides,
  });
}

describe("availability troubleshooter", () => {
  test("reports an eligible time without exposing calendar detail", () => {
    expect(diagnose()).toEqual({ userId: "host", available: true, reason: "available" });
  });

  test("distinguishes recurring hours, time off, and calendar conflicts", () => {
    expect(diagnose({
      slot: {
        start: Temporal.Instant.from("2027-05-03T20:00:00Z"),
        end: Temporal.Instant.from("2027-05-03T20:30:00Z"),
      },
    }).reason).toBe("outside_working_hours");
    expect(diagnose({
      schedule: {
        ...schedule,
        overrides: [{ startDate: "2027-05-03", endDate: "2027-05-03", kind: "unavailable" }],
      },
    }).reason).toBe("time_off");
    expect(diagnose({
      busy: [{
        start: Temporal.Instant.from("2027-05-03T13:45:00Z"),
        end: Temporal.Instant.from("2027-05-03T14:15:00Z"),
      }],
    }).reason).toBe("calendar_conflict");
  });

  test("reports policy and configuration blockers", () => {
    expect(diagnose({ schedule: undefined }).reason).toBe("schedule_missing");
    expect(diagnose({ minimumNoticeMin: 60 * 72 }).reason).toBe("minimum_notice");
    expect(diagnose({ rollingWindowDays: 1 }).reason).toBe("rolling_window");
    expect(diagnose({
      slot: {
        start: Temporal.Instant.from("2027-05-03T09:00:00Z"),
        end: Temporal.Instant.from("2027-05-03T09:30:00Z"),
      },
      bufferBeforeMin: 15,
    }).reason).toBe("buffer_outside_hours");
  });
});

import { describe, expect, test } from "bun:test";
import {
  starterEventType,
  starterEventTypeSlug,
  starterSchedule,
} from "../../../src/core/onboarding/starter";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";

describe("starterSchedule", () => {
  test("is weekdays 09:00–17:00 in the host's own zone", () => {
    const schedule = starterSchedule("America/New_York");
    expect(schedule.timezone).toBe("America/New_York");
    expect(schedule.rules).toEqual([
      { dow: 1, start: "09:00", end: "17:00" },
      { dow: 2, start: "09:00", end: "17:00" },
      { dow: 3, start: "09:00", end: "17:00" },
      { dow: 4, start: "09:00", end: "17:00" },
      { dow: 5, start: "09:00", end: "17:00" },
    ]);
  });

  test("offers no weekend time by default", () => {
    const dows = starterSchedule("UTC").rules.map((rule) => rule.dow);
    expect(dows).not.toContain(0);
    expect(dows).not.toContain(6);
  });
});

describe("starterEventTypeSlug", () => {
  test("retries with a numbered suffix so slug_taken is recoverable", () => {
    expect(starterEventTypeSlug()).toBe("intro-call");
    expect(starterEventTypeSlug(0)).toBe("intro-call");
    expect(starterEventTypeSlug(1)).toBe("intro-call-2");
    expect(starterEventTypeSlug(2)).toBe("intro-call-3");
  });
});

describe("starterEventType", () => {
  test("is a 30-minute solo Google Meet owned by the host", () => {
    const eventType = starterEventType({ userId: USER_ID, scheduleId: SCHEDULE_ID });
    expect(eventType).toMatchObject({
      slug: "intro-call",
      durationMinutes: 30,
      capacity: 1,
      mode: "solo",
      scheduleId: SCHEDULE_ID,
      teamId: null,
      meetingFormats: ["google_meet"],
      hosts: [{ userId: USER_ID, role: "member", weight: 1 }],
    });
  });

  // Protects the two defaults a new host is most likely to be burned by: a
  // stranger booking the next ten minutes, and zero gap between meetings.
  test("defends the host's day with a notice floor and a trailing buffer", () => {
    const eventType = starterEventType({ userId: USER_ID, scheduleId: SCHEDULE_ID });
    expect(eventType.minimumNoticeMin).toBeGreaterThanOrEqual(60);
    expect(eventType.bufferAfterMin).toBeGreaterThan(0);
    expect(eventType.rollingWindowDays).toBe(30);
  });

  test("passes the retry attempt through to the slug", () => {
    expect(starterEventType({ userId: USER_ID, scheduleId: null, attempt: 1 }).slug)
      .toBe("intro-call-2");
  });
});

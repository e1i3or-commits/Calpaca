import { expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { withinBookingWindow } from "../../src/core/availability/booking-window";
import { bookingWindowSchema, type BookingWindow } from "../../src/core/availability/booking-window-schema";
const limits: BookingWindow = { timezone: "America/New_York", startDate: "2026-11-02", endDate: "2026-11-09", weeklyWindows: [{ dow: 1, start: "09:00", end: "12:00" }], excludedDates: ["2026-11-09"] };
const slot = (start: string, end: string) => ({ start: Temporal.Instant.from(start), end: Temporal.Instant.from(end) });
test("only offers the complete meeting inside the link's dates, hours and timezone", () => {
  expect(withinBookingWindow(slot("2026-11-02T14:00Z", "2026-11-02T14:30Z"), limits)).toBe(true);
  expect(withinBookingWindow(slot("2026-10-26T13:00Z", "2026-10-26T13:30Z"), limits)).toBe(false);
  expect(withinBookingWindow(slot("2026-11-02T13:30Z", "2026-11-02T14:00Z"), limits)).toBe(false);
  expect(withinBookingWindow(slot("2026-11-02T16:45Z", "2026-11-02T17:15Z"), limits)).toBe(false);
  expect(withinBookingWindow(slot("2026-11-09T14:00Z", "2026-11-09T14:30Z"), limits)).toBe(false);
  expect(withinBookingWindow(slot("2026-11-16T14:00Z", "2026-11-16T14:30Z"), limits)).toBe(false);
});
test("DST changes preserve local hours and multiple windows leave a lunch break", () => {
  const windows = { ...limits, startDate: null, endDate: null, excludedDates: [], weeklyWindows: [{ dow: 1, start: "09:00", end: "12:00" }, { dow: 1, start: "13:00", end: "17:00" }] };
  expect(withinBookingWindow(slot("2026-10-26T13:00Z", "2026-10-26T13:30Z"), windows)).toBe(true);
  expect(withinBookingWindow(slot("2026-11-02T14:00Z", "2026-11-02T14:30Z"), windows)).toBe(true);
  expect(withinBookingWindow(slot("2026-11-02T17:00Z", "2026-11-02T17:30Z"), windows)).toBe(false);
});
test("no limits preserves existing behavior; empty weekly hours closes the link", () => {
  const s = slot("2026-11-02T14:00Z", "2026-11-02T14:30Z");
  expect(withinBookingWindow(s)).toBe(true);
  expect(withinBookingWindow(s, { ...limits, weeklyWindows: [] })).toBe(false);
  expect(withinBookingWindow(s, { ...limits, weeklyWindows: null })).toBe(true);
});
test("validation rejects impossible dates, invalid zones and reversed ranges", () => {
  for (const patch of [{ timezone: "made/up" }, { startDate: "2026-02-30" }, { endDate: "2026-10-01" }, { weeklyWindows: [{ dow: 1, start: "17:00", end: "09:00" }] }]) {
    expect(bookingWindowSchema.safeParse({ ...limits, ...patch }).success).toBe(false);
  }
});

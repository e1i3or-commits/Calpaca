import { describe, expect, test } from "bun:test";
import {
  bookingState,
  occurrenceState,
  onboardingStage,
  seriesMeetings,
  seriesProgress,
  type BookingInput,
  type OccurrenceInput,
} from "../../../src/core/engagement/series";
import { previewSchedule, type ScheduleSnapshot } from "../../../src/core/engagement/followup-schedule";

const now = new Date("2027-02-01T12:00:00Z");
const at = (iso: string) => new Date(iso);
const booking = (id: string, eventTypeId: string, start: string, status = "confirmed"): BookingInput => ({
  id, eventTypeId, startsAt: at(start), endsAt: new Date(at(start).getTime() + 45 * 60_000), status, inviteStatus: "delivered", inviteeName: "Pat Owner", hostUserIds: ["host-1"],
});
const occurrence = (id: string, start: string, status: OccurrenceInput["status"], b: BookingInput | null = null): OccurrenceInput => ({
  id, startsAt: at(start), endsAt: new Date(at(start).getTime() + 45 * 60_000), status, exception: false, booking: b,
});
const types = [
  { id: "kick", title: "Jacksonville kickoff", kind: "kickoff" as const },
  { id: "follow", title: "Jacksonville follow-up", kind: "followup" as const },
  { id: "check", title: "Jacksonville check-in", kind: "checkin" as const },
];

describe("engagement series", () => {
  test("a booking is held once it ends, booked before, and keeps cancelled and no-show", () => {
    expect(bookingState({ status: "confirmed", endsAt: at("2027-02-01T11:00:00Z") }, now)).toBe("held");
    expect(bookingState({ status: "confirmed", endsAt: at("2027-02-01T13:00:00Z") }, now)).toBe("booked");
    expect(bookingState({ status: "cancelled", endsAt: at("2027-01-01T00:00:00Z") }, now)).toBe("cancelled");
    expect(bookingState({ status: "no_show", endsAt: at("2027-01-01T00:00:00Z") }, now)).toBe("no_show");
  });

  test("an occurrence's own status wins over a booking whose cancellation is still being sent", () => {
    const b = booking("b1", "follow", "2027-02-10T15:00:00Z");
    expect(occurrenceState(occurrence("o1", "2027-02-10T15:00:00Z", "cancelled", b), now)).toBe("cancelled");
    expect(occurrenceState(occurrence("o1", "2027-02-10T15:00:00Z", "draft", b), now)).toBe("booked");
    expect(occurrenceState(occurrence("o1", "2027-02-10T15:00:00Z", "paused"), now)).toBe("paused");
    expect(occurrenceState(occurrence("o1", "2027-02-10T15:00:00Z", "draft"), now)).toBe("planned");
    expect(occurrenceState(occurrence("o1", "2027-01-10T15:00:00Z", "draft"), now)).toBe("unbooked");
    // A replaced cancelled generation does not make a live date look cancelled.
    expect(occurrenceState(occurrence("o1", "2027-02-10T15:00:00Z", "draft", booking("b0", "follow", "2027-02-10T15:00:00Z", "cancelled")), now)).toBe("planned");
  });

  test("meetings come from bookings and occurrences, follow-up bookings only through their date", () => {
    const followBooking = booking("b2", "follow", "2027-01-20T15:00:00Z");
    const meetings = seriesMeetings({
      eventTypes: types,
      bookings: [booking("b1", "kick", "2027-01-05T15:00:00Z"), followBooking, booking("b-old", "follow", "2027-01-19T15:00:00Z", "cancelled"), booking("x", "elsewhere", "2027-01-06T15:00:00Z")],
      occurrences: [occurrence("o1", "2027-01-20T15:00:00Z", "draft", followBooking), occurrence("o2", "2027-02-03T15:00:00Z", "draft"), occurrence("o3", "2027-02-17T15:00:00Z", "cancelled")],
      followupTitle: "Jacksonville follow-up",
      now,
    });
    expect(meetings.map((m) => [m.id, m.kind, m.state])).toEqual([
      ["b1", "kickoff", "held"],
      ["o1", "followup", "held"],
      ["o2", "followup", "planned"],
      ["o3", "followup", "cancelled"],
    ]);
    expect(meetings[1]).toMatchObject({ bookingId: "b2", occurrenceId: "o1", inviteeName: "Pat Owner", hostUserIds: ["host-1"] });
    expect(meetings[2]).toMatchObject({ bookingId: null, hostUserIds: [] });
    const progress = seriesProgress(meetings, now);
    expect(progress).toMatchObject({ held: 2, total: 3, noShows: 0 });
    expect(progress.next?.id).toBe("o2");
    expect(progress.lastHeld?.id).toBe("o1");
  });

  test("the onboarding stage moves kickoff, follow-ups, check-in, complete", () => {
    const m = (kind: "kickoff" | "followup" | "checkin", state: "held" | "planned" | "booked") =>
      ({ id: `${kind}-${state}`, kind, title: "", startsAt: "", endsAt: "", state, bookingId: null, occurrenceId: null, exception: false, inviteStatus: null, inviteeName: null, hostUserIds: [] });
    expect(onboardingStage([m("kickoff", "booked")], null)).toBe("kickoff");
    expect(onboardingStage([m("kickoff", "held")], null)).toBe("followups");
    expect(onboardingStage([m("kickoff", "held"), m("followup", "planned")], "planned")).toBe("followups");
    expect(onboardingStage([m("kickoff", "held"), m("followup", "held")], "ended")).toBe("checkin");
    expect(onboardingStage([m("kickoff", "held"), m("followup", "held"), m("checkin", "held")], "ended")).toBe("complete");
  });

  test("skip removes one future date and leaves the others and the past alone", () => {
    const schedule: NonNullable<ScheduleSnapshot["schedule"]> = {
      status: "planned",
      rule: { cadence: "biweekly", anchorDate: "2027-01-20", localTime: "10:00", timezone: "America/New_York", monthlyMode: "weekday_position", count: 3 },
      occurrences: [
        { id: "00000000-0000-4000-8000-000000000001", position: 1, startsAt: "2027-01-20T15:00:00.000Z", endsAt: "2027-01-20T15:45:00.000Z", status: "draft", exception: false },
        { id: "00000000-0000-4000-8000-000000000002", position: 2, startsAt: "2027-02-03T15:00:00.000Z", endsAt: "2027-02-03T15:45:00.000Z", status: "draft", exception: false, bookingId: "b" },
        { id: "00000000-0000-4000-8000-000000000003", position: 3, startsAt: "2027-02-17T15:00:00.000Z", endsAt: "2027-02-17T15:45:00.000Z", status: "draft", exception: false },
      ],
    };
    const skipped = previewSchedule(schedule, { action: "skip", occurrenceId: "00000000-0000-4000-8000-000000000002" }, now.toISOString());
    expect(skipped.canApply).toBe(true);
    expect(skipped.changes).toHaveLength(1);
    expect(skipped.changes[0]).toMatchObject({ id: "00000000-0000-4000-8000-000000000002", action: "cancel", status: "cancelled", previousStartsAt: "2027-02-03T15:00:00.000Z" });
    expect(skipped.status).toBe("planned");
    const past = previewSchedule(schedule, { action: "skip", occurrenceId: "00000000-0000-4000-8000-000000000001" }, now.toISOString());
    expect(past.canApply).toBe(false);
    expect(past.issues).toEqual(["Only an existing future meeting can be skipped."]);
    const ended = previewSchedule({ ...schedule, status: "ended" }, { action: "skip", occurrenceId: "00000000-0000-4000-8000-000000000003" }, now.toISOString());
    expect(ended.canApply).toBe(false);
    expect(ended.changes).toHaveLength(0);
  });
});

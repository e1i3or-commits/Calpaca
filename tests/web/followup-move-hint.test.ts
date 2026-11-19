import { describe, expect, test } from "bun:test";
import { followupMoveHint } from "../../web/src/lib/followup-move-hint";

const day = (time: string) => `2026-11-24T${time}:00Z`;
const zone = "America/New_York";

describe("follow-up move hint", () => {
  test("lists team busy times and the first open time", () => {
    const hint = followupMoveHint({ timezone: zone, durationMinutes: 45,
      teamBusy: [{ start: day("15:30"), end: day("16:00") }, { start: day("16:30"), end: day("18:00") }],
      slots: [{ start: day("18:00"), end: day("18:45") }] }, zone);
    expect(hint.busy).toContain("A required teammate is busy:");
    expect(hint.busy).toContain("10:30");
    expect(hint.busy).toContain("11:30");
    expect(hint.summary).toContain("First open time:");
    expect(hint.summary).toContain("1:00");
  });

  test("explains a day blocked by conflicts", () => {
    const hint = followupMoveHint({ timezone: zone, durationMinutes: 45,
      teamBusy: [{ start: day("14:00"), end: day("22:00") }], slots: [] }, zone);
    expect(hint.summary).toContain("No 45-minute gap");
  });

  test("explains a day with no open hours at all", () => {
    const hint = followupMoveHint({ timezone: zone, durationMinutes: 45, teamBusy: [], slots: [] }, zone);
    expect(hint.busy).toBeNull();
    expect(hint.summary).toContain("No time is open for the whole required team");
  });
});

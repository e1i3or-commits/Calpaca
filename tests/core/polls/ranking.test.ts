import { describe, expect, test } from "bun:test";
import { rankPollOptions } from "../../../src/core/polls/ranking";

describe("rankPollOptions", () => {
  test("prefers yes, then if-needed, then fewer no votes", () => {
    expect(rankPollOptions([
      { optionId: "b", yes: 2, ifNeeded: 1, no: 1 },
      { optionId: "a", yes: 2, ifNeeded: 2, no: 3 },
      { optionId: "c", yes: 3, ifNeeded: 0, no: 4 },
    ]).map((option) => option.optionId)).toEqual(["c", "a", "b"]);
  });

  test("uses option id as a deterministic final tie-break", () => {
    expect(rankPollOptions([
      { optionId: "later", yes: 1, ifNeeded: 0, no: 0 },
      { optionId: "earlier", yes: 1, ifNeeded: 0, no: 0 },
    ])[0]?.optionId).toBe("earlier");
  });
});

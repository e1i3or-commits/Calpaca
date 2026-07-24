import { describe, expect, test } from "bun:test";
import {
  confidenceFromEvidence,
  recommendationProvenance,
} from "../../../src/core/availability/provenance";

const signals = {
  fragmentationPenalty: 0,
  consumesBlockEdge: true,
  adjacencyBonus: 0,
  timeOfDayScore: 1,
  focusBlockPenalty: 0,
};

describe("recommendation provenance", () => {
  test("derives confidence from complete recorded evidence", () => {
    expect(confidenceFromEvidence([
      { connected: true, healthy: true, checkedAt: "2027-01-04T08:58:00Z" },
      { connected: true, healthy: true, checkedAt: "2027-01-04T08:59:00Z" },
    ], 2)).toEqual({
      confidence: "confirmed",
      evidenceCheckedAt: "2027-01-04T08:58:00Z",
    });
  });

  test("names missing and stale evidence without inventing certainty", () => {
    expect(confidenceFromEvidence([], 1)).toEqual({ confidence: "unknown" });
    expect(confidenceFromEvidence([
      { connected: true, healthy: false, checkedAt: "2027-01-04T07:00:00Z" },
    ], 1)).toEqual({
      confidence: "stale",
      evidenceCheckedAt: "2027-01-04T07:00:00Z",
    });
  });

  test("produces two to four public-safe reasons from deterministic signals", () => {
    const result = recommendationProvenance({
      signals,
      confidence: "confirmed",
      evidenceCheckedAt: "2027-01-04T08:58:00Z",
      mutual: true,
      inviteeCalendarConnected: true,
      localHourWarning: false,
      requiredParticipantCount: 1,
    });
    expect(result.confidence).toBe("confirmed");
    expect(result.reasons.map((reason) => reason.label)).toEqual([
      "Works with your calendar",
      "Organizer calendar checked",
      "Matches preferred meeting hours",
      "Fits organizer preferences",
    ]);
    expect(result.reasons.every((reason) => !reason.label.includes("AI"))).toBe(true);
  });

  test("shows a real tradeoff when the invitee overlay conflicts", () => {
    const result = recommendationProvenance({
      signals: { ...signals, fragmentationPenalty: 1, consumesBlockEdge: false },
      confidence: "unknown",
      mutual: false,
      inviteeCalendarConnected: true,
      localHourWarning: false,
      requiredParticipantCount: 1,
    });
    expect(result.reasons[0]?.kind).toBe("tradeoff");
    expect(result.reasons[0]?.label).toBe("Conflicts with your calendar");
  });
});

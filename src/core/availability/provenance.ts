import type { ScoringSignals } from "./scoring";

export type RecommendationConfidence =
  | "confirmed"
  | "needs_confirmation"
  | "unknown"
  | "stale";

export type RecommendationReason = {
  readonly kind: "positive" | "tradeoff" | "warning";
  readonly label: string;
  readonly detail: string;
};

export type RecommendationProvenance = {
  readonly confidence: RecommendationConfidence;
  readonly evidenceCheckedAt?: string;
  readonly reasons: readonly RecommendationReason[];
};

export type AvailabilityEvidence = {
  readonly connected: boolean;
  readonly healthy: boolean;
  readonly checkedAt?: string;
};

export function confidenceFromEvidence(
  evidence: readonly AvailabilityEvidence[],
  requiredCount: number,
): Pick<RecommendationProvenance, "confidence" | "evidenceCheckedAt"> {
  if (requiredCount === 0 || evidence.length < requiredCount) {
    return { confidence: "unknown" };
  }
  if (evidence.some((item) => !item.connected)) {
    return { confidence: "unknown" };
  }
  const checked = evidence.flatMap((item) => item.checkedAt ? [item.checkedAt] : []);
  if (evidence.some((item) => !item.healthy) || checked.length < requiredCount) {
    return {
      confidence: "stale",
      ...(checked.length ? { evidenceCheckedAt: [...checked].sort()[0] } : {}),
    };
  }
  return {
    confidence: "confirmed",
    evidenceCheckedAt: [...checked].sort()[0],
  };
}

export function recommendationProvenance(input: {
  signals: ScoringSignals;
  confidence: RecommendationConfidence;
  evidenceCheckedAt?: string;
  mutual?: boolean;
  inviteeCalendarConnected: boolean;
  localHourWarning: boolean;
  requiredParticipantCount: number;
  optionalParticipantConflict?: boolean;
}): RecommendationProvenance {
  const reasons: RecommendationReason[] = [];
  if (input.mutual) {
    reasons.push({
      kind: "positive",
      label: "Works with your calendar",
      detail: "No conflict was found in the calendar you connected for this visit.",
    });
  } else if (input.inviteeCalendarConnected) {
    reasons.push({
      kind: "tradeoff",
      label: "Conflicts with your calendar",
      detail: "Your connected calendar contains a conflict during this time.",
    });
  }

  if (input.confidence === "confirmed") {
    reasons.push({
      kind: "positive",
      label: input.requiredParticipantCount > 1
        ? "Required calendars checked"
        : "Organizer calendar checked",
      detail: "Current calendar evidence shows the required people are available.",
    });
  } else if (input.confidence === "stale") {
    reasons.push({
      kind: "warning",
      label: "Calendar evidence is delayed",
      detail: "This time matches configured availability, but calendar synchronization needs attention.",
    });
  } else if (input.confidence === "needs_confirmation") {
    reasons.push({
      kind: "warning",
      label: "Participant confirmation needed",
      detail: "At least one participant has not confirmed this option.",
    });
  } else {
    reasons.push({
      kind: "warning",
      label: "Calendar verification unavailable",
      detail: "This time matches configured availability, but current calendar evidence is unavailable.",
    });
  }

  if (input.localHourWarning) {
    reasons.push({
      kind: "warning",
      label: "Outside typical local hours",
      detail: "Check that this time is comfortable in your selected timezone.",
    });
  } else if (input.signals.timeOfDayScore >= 0.75) {
    reasons.push({
      kind: "positive",
      label: "Matches preferred meeting hours",
      detail: "This time aligns with the organizer's configured time preference.",
    });
  }

  if (input.optionalParticipantConflict) {
    reasons.push({
      kind: "tradeoff",
      label: "Optional participant unavailable",
      detail: "All required people are available, but an optional participant has a conflict.",
    });
  } else if (
    input.signals.adjacencyBonus > 0
    || input.signals.consumesBlockEdge
  ) {
    reasons.push({
      kind: "positive",
      label: "Fits organizer preferences",
      detail: "This option fits the organizer's configured scheduling pattern.",
    });
  } else if (
    input.signals.fragmentationPenalty > 0
    || input.signals.focusBlockPenalty > 0
  ) {
    reasons.push({
      kind: "tradeoff",
      label: "Available with a tradeoff",
      detail: "This option is available, but it is less aligned with the organizer's scheduling preferences.",
    });
  }

  if (reasons.length < 2) {
    reasons.push({
      kind: "positive",
      label: "Fits the booking rules",
      detail: "This time satisfies duration, notice, buffer, and availability requirements.",
    });
  }

  return {
    confidence: input.confidence,
    ...(input.evidenceCheckedAt ? { evidenceCheckedAt: input.evidenceCheckedAt } : {}),
    reasons: reasons.slice(0, 4),
  };
}

import { evaluateCondition, type Condition, type RoutingAnswers } from "./condition";

// First-match rule evaluation: lowest priority number wins. Pure — the route
// loads the rules, this decides.

export interface RoutingRuleInput {
  readonly id: string;
  readonly priority: number;
  readonly condition: Condition;
  readonly targetEventTypeId: string | null;
  readonly targetHostUserId: string | null;
}

export interface RoutingMatch {
  readonly ruleId: string;
  readonly targetEventTypeId: string | null;
  readonly targetHostUserId: string | null;
}

export function evaluateRouting(
  rules: readonly RoutingRuleInput[],
  answers: RoutingAnswers,
): RoutingMatch | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (evaluateCondition(rule.condition, answers)) {
      return {
        ruleId: rule.id,
        targetEventTypeId: rule.targetEventTypeId,
        targetHostUserId: rule.targetHostUserId,
      };
    }
  }
  return null;
}

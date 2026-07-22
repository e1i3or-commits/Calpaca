// Routing rule condition AST. Stored as jsonb on routing_rules and evaluated
// here as a pure function over the invitee's form answers — the DB stores
// data, never logic.

export type RoutingAnswers = Readonly<Record<string, string | readonly string[]>>;

export type Condition =
  | { readonly kind: "always" }
  | { readonly kind: "eq"; readonly field: string; readonly value: string }
  | { readonly kind: "ne"; readonly field: string; readonly value: string }
  // substring on text answers, membership on multiselect answers
  | { readonly kind: "contains"; readonly field: string; readonly value: string }
  | { readonly kind: "in"; readonly field: string; readonly values: readonly string[] }
  | { readonly kind: "and"; readonly all: readonly Condition[] }
  | { readonly kind: "or"; readonly any: readonly Condition[] }
  | { readonly kind: "not"; readonly not: Condition };

function answerValues(answers: RoutingAnswers, field: string): readonly string[] {
  const raw = answers[field];
  if (raw === undefined) return [];
  return typeof raw === "string" ? [raw] : raw;
}

/** Missing answers never match a positive predicate: `eq` on an unanswered
 * field is false, so `not`/`ne` on one is true. */
export function evaluateCondition(condition: Condition, answers: RoutingAnswers): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "eq":
      return answerValues(answers, condition.field).includes(condition.value);
    case "ne":
      return !answerValues(answers, condition.field).includes(condition.value);
    case "contains":
      return answerValues(answers, condition.field).some((v) =>
        v.toLowerCase().includes(condition.value.toLowerCase()),
      );
    case "in":
      return answerValues(answers, condition.field).some((v) => condition.values.includes(v));
    case "and":
      return condition.all.every((c) => evaluateCondition(c, answers));
    case "or":
      return condition.any.some((c) => evaluateCondition(c, answers));
    case "not":
      return !evaluateCondition(condition.not, answers);
  }
}

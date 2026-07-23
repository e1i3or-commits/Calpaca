export type BookingQuestionType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "phone"
  | "checkbox";

export type BookingQuestion = {
  id: string;
  label: string;
  type: BookingQuestionType;
  required: boolean;
  hidden: boolean;
  options?: string[];
};

export type BookingAnswer = string | string[] | boolean;
export type BookingAnswers = Record<string, BookingAnswer>;

export type BookingAnswerIssue = {
  id: string;
  reason: "unknown" | "required" | "invalid_type" | "invalid_option" | "too_long";
};

export function validateBookingAnswers(
  questions: readonly BookingQuestion[],
  answers: BookingAnswers,
): { ok: true; answers: BookingAnswers } | { ok: false; issues: BookingAnswerIssue[] } {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const issues: BookingAnswerIssue[] = [];
  const normalized: BookingAnswers = {};

  for (const [id, value] of Object.entries(answers)) {
    const question = byId.get(id);
    if (!question) {
      issues.push({ id, reason: "unknown" });
      continue;
    }
    if (question.type === "checkbox") {
      if (typeof value !== "boolean") issues.push({ id, reason: "invalid_type" });
      else normalized[id] = value;
      continue;
    }
    if (question.type === "multiselect") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        issues.push({ id, reason: "invalid_type" });
      } else if (value.some((item) => !(question.options ?? []).includes(item))) {
        issues.push({ id, reason: "invalid_option" });
      } else {
        normalized[id] = [...new Set(value)];
      }
      continue;
    }
    if (typeof value !== "string") {
      issues.push({ id, reason: "invalid_type" });
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 2000) issues.push({ id, reason: "too_long" });
    else if (question.type === "select" && trimmed && !(question.options ?? []).includes(trimmed)) {
      issues.push({ id, reason: "invalid_option" });
    } else if (trimmed) {
      normalized[id] = trimmed;
    }
  }

  for (const question of questions) {
    const answer = normalized[question.id];
    const missing = answer === undefined
      || answer === ""
      || (Array.isArray(answer) && answer.length === 0)
      || (question.type === "checkbox" && answer !== true);
    if (question.required && missing) issues.push({ id: question.id, reason: "required" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, answers: normalized };
}

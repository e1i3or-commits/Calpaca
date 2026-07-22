import { err, ok, type Result } from "../../lib/result";
import type { RoutingAnswers } from "./condition";

// Routing form definition (routing_forms.fields jsonb) and pure validation
// of submitted answers against it.

export type RoutingFieldType = "text" | "email" | "select" | "multiselect";

export interface RoutingField {
  readonly key: string;
  readonly label: string;
  readonly type: RoutingFieldType;
  readonly required: boolean;
  /** select/multiselect only */
  readonly options?: readonly string[];
}

export interface AnswerIssue {
  readonly field: string;
  readonly reason: "missing" | "unknown_field" | "bad_type" | "not_an_option" | "invalid_email";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates raw answers against the form definition and returns them
 * normalized: only known keys, strings trimmed, empty answers dropped. */
export function validateAnswers(
  fields: readonly RoutingField[],
  raw: RoutingAnswers,
): Result<RoutingAnswers, readonly AnswerIssue[]> {
  const issues: AnswerIssue[] = [];
  const known = new Map(fields.map((f) => [f.key, f]));
  const normalized: Record<string, string | readonly string[]> = {};

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) issues.push({ field: key, reason: "unknown_field" });
  }

  for (const field of fields) {
    const value = raw[field.key];
    const isMulti = field.type === "multiselect";

    if (value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0)) {
      if (field.required) issues.push({ field: field.key, reason: "missing" });
      continue;
    }

    if (isMulti !== Array.isArray(value)) {
      issues.push({ field: field.key, reason: "bad_type" });
      continue;
    }

    const values = typeof value === "string" ? [value.trim()] : value.map((v) => v.trim());

    if ((field.type === "select" || field.type === "multiselect") && field.options) {
      if (!values.every((v) => field.options!.includes(v))) {
        issues.push({ field: field.key, reason: "not_an_option" });
        continue;
      }
    }
    if (field.type === "email" && !EMAIL_RE.test(values[0]!)) {
      issues.push({ field: field.key, reason: "invalid_email" });
      continue;
    }

    normalized[field.key] = isMulti ? values : values[0]!;
  }

  return issues.length > 0 ? err(issues) : ok(normalized);
}

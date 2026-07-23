import { describe, expect, test } from "bun:test";
import { validateBookingAnswers, type BookingQuestion } from "../../../src/core/booking/questions";

const questions: BookingQuestion[] = [
  { id: "role", label: "Role", type: "select", required: true, hidden: false, options: ["Design", "Engineering"] },
  { id: "topics", label: "Topics", type: "multiselect", required: false, hidden: false, options: ["API", "UI"] },
  { id: "consent", label: "Consent", type: "checkbox", required: true, hidden: false },
  { id: "campaign", label: "Campaign", type: "text", required: false, hidden: true },
];

describe("validateBookingAnswers", () => {
  test("normalizes valid visible and hidden answers", () => {
    expect(validateBookingAnswers(questions, {
      role: "Design",
      topics: ["API", "API"],
      consent: true,
      campaign: " summer ",
    })).toEqual({
      ok: true,
      answers: { role: "Design", topics: ["API"], consent: true, campaign: "summer" },
    });
  });

  test("rejects missing, unknown, mistyped, and out-of-list answers", () => {
    const result = validateBookingAnswers(questions, {
      role: "Sales",
      topics: "API",
      consent: false,
      extra: "value",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({ id: "role", reason: "invalid_option" });
    expect(result.issues).toContainEqual({ id: "topics", reason: "invalid_type" });
    expect(result.issues).toContainEqual({ id: "consent", reason: "required" });
    expect(result.issues).toContainEqual({ id: "extra", reason: "unknown" });
  });
});

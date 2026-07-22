import { describe, expect, test } from "bun:test";
import { validateAnswers, type RoutingField } from "../../../src/core/routing/form";

const fields: RoutingField[] = [
  { key: "email", label: "Work email", type: "email", required: true },
  { key: "size", label: "Company size", type: "select", required: true, options: ["1-10", "11-100", "100+"] },
  { key: "topics", label: "Topics", type: "multiselect", required: false, options: ["billing", "sales"] },
  { key: "notes", label: "Notes", type: "text", required: false },
];

describe("validateAnswers", () => {
  test("accepts a full valid submission and normalizes whitespace", () => {
    const result = validateAnswers(fields, {
      email: " kai@example.test ",
      size: "11-100",
      topics: ["billing"],
      notes: "hello",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("kai@example.test");
      expect(result.value.topics).toEqual(["billing"]);
    }
  });

  test("missing required fields and unknown keys are reported", () => {
    const result = validateAnswers(fields, { bogus: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const reasons = result.error.map((i) => `${i.field}:${i.reason}`).sort();
      expect(reasons).toEqual(["bogus:unknown_field", "email:missing", "size:missing"]);
    }
  });

  test("select answers must be one of the options; multiselect must be an array", () => {
    const badOption = validateAnswers(fields, { email: "a@b.co", size: "500+" });
    expect(badOption.ok).toBe(false);
    if (!badOption.ok) expect(badOption.error[0]).toEqual({ field: "size", reason: "not_an_option" });

    const badType = validateAnswers(fields, { email: "a@b.co", size: "1-10", topics: "billing" });
    expect(badType.ok).toBe(false);
    if (!badType.ok) expect(badType.error[0]).toEqual({ field: "topics", reason: "bad_type" });
  });

  test("email fields are shape-checked; optional empties are dropped", () => {
    const bad = validateAnswers(fields, { email: "not-an-email", size: "1-10" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error[0]).toEqual({ field: "email", reason: "invalid_email" });

    const ok = validateAnswers(fields, { email: "a@b.co", size: "1-10", notes: "  ", topics: [] });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect("notes" in ok.value).toBe(false);
      expect("topics" in ok.value).toBe(false);
    }
  });
});

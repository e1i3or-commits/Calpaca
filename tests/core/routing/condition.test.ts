import { describe, expect, test } from "bun:test";
import { evaluateCondition, type Condition } from "../../../src/core/routing/condition";

describe("evaluateCondition", () => {
  test("eq / ne on text answers", () => {
    const answers = { size: "enterprise" };
    expect(evaluateCondition({ kind: "eq", field: "size", value: "enterprise" }, answers)).toBe(true);
    expect(evaluateCondition({ kind: "eq", field: "size", value: "startup" }, answers)).toBe(false);
    expect(evaluateCondition({ kind: "ne", field: "size", value: "startup" }, answers)).toBe(true);
  });

  test("missing answers never match positive predicates", () => {
    expect(evaluateCondition({ kind: "eq", field: "size", value: "x" }, {})).toBe(false);
    expect(evaluateCondition({ kind: "contains", field: "size", value: "x" }, {})).toBe(false);
    expect(evaluateCondition({ kind: "in", field: "size", values: ["x"] }, {})).toBe(false);
    // ...so their negations are true
    expect(evaluateCondition({ kind: "ne", field: "size", value: "x" }, {})).toBe(true);
  });

  test("eq matches membership on multiselect answers", () => {
    const answers = { topics: ["billing", "onboarding"] };
    expect(evaluateCondition({ kind: "eq", field: "topics", value: "billing" }, answers)).toBe(true);
    expect(evaluateCondition({ kind: "eq", field: "topics", value: "sales" }, answers)).toBe(false);
  });

  test("contains is case-insensitive substring", () => {
    const answers = { company: "Acme GmbH" };
    expect(evaluateCondition({ kind: "contains", field: "company", value: "gmbh" }, answers)).toBe(true);
    expect(evaluateCondition({ kind: "contains", field: "company", value: "inc" }, answers)).toBe(false);
  });

  test("in matches any listed value", () => {
    const answers = { region: "emea" };
    expect(evaluateCondition({ kind: "in", field: "region", values: ["emea", "apac"] }, answers)).toBe(true);
    expect(evaluateCondition({ kind: "in", field: "region", values: ["amer"] }, answers)).toBe(false);
  });

  test("and / or / not compose; always is true; empty and is vacuous", () => {
    const answers = { size: "enterprise", region: "emea" };
    const cond: Condition = {
      kind: "and",
      all: [
        { kind: "eq", field: "size", value: "enterprise" },
        { kind: "or", any: [{ kind: "eq", field: "region", value: "emea" }, { kind: "eq", field: "region", value: "apac" }] },
        { kind: "not", not: { kind: "eq", field: "size", value: "startup" } },
      ],
    };
    expect(evaluateCondition(cond, answers)).toBe(true);
    expect(evaluateCondition({ kind: "always" }, {})).toBe(true);
    expect(evaluateCondition({ kind: "and", all: [] }, {})).toBe(true);
    expect(evaluateCondition({ kind: "or", any: [] }, {})).toBe(false);
  });
});

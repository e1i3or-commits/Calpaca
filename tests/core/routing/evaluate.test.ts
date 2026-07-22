import { describe, expect, test } from "bun:test";
import { evaluateRouting, type RoutingRuleInput } from "../../../src/core/routing/evaluate";

const rules: RoutingRuleInput[] = [
  {
    id: "r-catchall",
    priority: 100,
    condition: { kind: "always" },
    targetEventTypeId: "et-general",
    targetHostUserId: null,
  },
  {
    id: "r-enterprise",
    priority: 1,
    condition: { kind: "eq", field: "size", value: "100+" },
    targetEventTypeId: "et-enterprise",
    targetHostUserId: "host-senior",
  },
  {
    id: "r-emea",
    priority: 2,
    condition: { kind: "in", field: "region", values: ["emea", "apac"] },
    targetEventTypeId: "et-intl",
    targetHostUserId: null,
  },
];

describe("evaluateRouting", () => {
  test("lowest priority number wins regardless of array order", () => {
    const match = evaluateRouting(rules, { size: "100+", region: "emea" });
    expect(match?.ruleId).toBe("r-enterprise");
    expect(match?.targetHostUserId).toBe("host-senior");
  });

  test("falls through to later rules, then the catch-all", () => {
    expect(evaluateRouting(rules, { size: "1-10", region: "apac" })?.ruleId).toBe("r-emea");
    expect(evaluateRouting(rules, { size: "1-10", region: "amer" })?.ruleId).toBe("r-catchall");
  });

  test("returns null when nothing matches and no catch-all exists", () => {
    const noCatchAll = rules.filter((r) => r.id !== "r-catchall");
    expect(evaluateRouting(noCatchAll, { size: "1-10" })).toBeNull();
    expect(evaluateRouting([], {})).toBeNull();
  });
});

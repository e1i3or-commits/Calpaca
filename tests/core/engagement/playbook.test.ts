import { describe, expect, test } from "bun:test";
import { playbookReadiness } from "../../../src/core/engagement/playbook";

describe("playbook readiness", () => {
  test("requires scheduling and outcome decisions before publishing", () => {
    expect(playbookReadiness({
      purpose: "",
      participantRoles: [],
      preparationItems: [],
      outcomeDefinition: null,
      durationMinutes: 30,
      scheduleId: null,
      hostCount: 0,
    })).toEqual({
      ready: false,
      issues: ["purpose", "participants", "outcome", "schedule", "hosts"],
    });
  });

  test("accepts a complete adapter over an existing event type", () => {
    expect(playbookReadiness({
      purpose: "Align scope and ownership",
      participantRoles: [{ role: "account_lead", required: true }],
      preparationItems: [{ label: "Client brief", required: true }],
      outcomeDefinition: "Scope and next milestone agreed",
      durationMinutes: 45,
      scheduleId: "schedule",
      hostCount: 1,
    })).toEqual({ ready: true, issues: [] });
  });
});

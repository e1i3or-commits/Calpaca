import { describe, expect, test } from "bun:test";
import { canTransitionEngagement } from "../../../src/core/engagement/model";
import {
  canCreateEngagement,
  canManageEngagement,
  canViewEngagement,
} from "../../../src/core/engagement/permissions";

const member = { userId: "member", workspaceRole: "member" as const };
const admin = { userId: "admin", workspaceRole: "admin" as const };

describe("engagement lifecycle", () => {
  test("supports potential, active, pause, completion, reopening, and archive paths", () => {
    expect(canTransitionEngagement("draft", "potential")).toBe(true);
    expect(canTransitionEngagement("potential", "active")).toBe(true);
    expect(canTransitionEngagement("active", "paused")).toBe(true);
    expect(canTransitionEngagement("paused", "active")).toBe(true);
    expect(canTransitionEngagement("active", "completed")).toBe(true);
    expect(canTransitionEngagement("completed", "active")).toBe(true);
    expect(canTransitionEngagement("completed", "archived")).toBe(true);
  });

  test("does not reopen an archived engagement", () => {
    expect(canTransitionEngagement("archived", "active")).toBe(false);
  });
});

describe("engagement permissions", () => {
  test("active workspace members can create engagements", () => {
    expect(canCreateEngagement(member)).toBe(true);
  });

  test("workspace-visible engagements are discoverable by members", () => {
    expect(canViewEngagement(member, {
      visibility: "workspace",
      accountLeadUserId: "lead",
      assignedUserIds: [],
    })).toBe(true);
  });

  test("restricted engagements are limited to assigned people and administrators", () => {
    const restricted = {
      visibility: "restricted" as const,
      accountLeadUserId: "lead",
      assignedUserIds: ["assigned"],
    };
    expect(canViewEngagement(member, restricted)).toBe(false);
    expect(canViewEngagement({ ...member, userId: "assigned" }, restricted)).toBe(true);
    expect(canViewEngagement(admin, restricted)).toBe(true);
  });

  test("only administrators and the account lead can manage an engagement", () => {
    const engagement = { accountLeadUserId: "lead" };
    expect(canManageEngagement(member, engagement)).toBe(false);
    expect(canManageEngagement({ ...member, userId: "lead" }, engagement)).toBe(true);
    expect(canManageEngagement(admin, engagement)).toBe(true);
  });
});

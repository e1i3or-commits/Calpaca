import { describe, expect, test } from "bun:test";
import { entitlementsFor } from "../../../src/core/workspace/entitlements";

describe("workspace entitlements", () => {
  test("free hosted accounts stay single-user and unbranded", () => {
    expect(entitlementsFor("free")).toEqual({
      memberLimit: 1,
      customDomains: false,
      whitelabel: false,
      inviteeCalendarOverlay: false,
      meetingPolls: false,
    });
  });

  test("self-hosted installations retain every product capability", () => {
    expect(entitlementsFor("self_hosted")).toMatchObject({
      memberLimit: null,
      customDomains: true,
      whitelabel: true,
      inviteeCalendarOverlay: true,
      meetingPolls: true,
    });
  });
});

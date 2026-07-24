import { describe, expect, test } from "bun:test";
import {
  canEditProposal,
  effectiveProposalStatus,
  transitionProposal,
} from "../../../src/core/proposals/state";

describe("proposal lifecycle", () => {
  test("keeps client action behind an explicit ready and send sequence", () => {
    expect(transitionProposal("draft", "send")).toBeNull();
    expect(transitionProposal("draft", "mark_ready")).toBe("ready");
    expect(transitionProposal("ready", "send")).toBe("awaiting_client");
    expect(transitionProposal("awaiting_client", "accept")).toBe("accepted");
  });

  test("requires explicit approval for an internally confirmed plan", () => {
    expect(transitionProposal("draft", "request_confirmation"))
      .toBe("awaiting_internal_confirmation");
    expect(transitionProposal("awaiting_internal_confirmation", "send")).toBeNull();
    expect(transitionProposal("awaiting_internal_confirmation", "approve")).toBe("ready");
  });

  test("allows withdrawal before acceptance but keeps terminal states final", () => {
    expect(transitionProposal("draft", "withdraw")).toBe("withdrawn");
    expect(transitionProposal("ready", "withdraw")).toBe("withdrawn");
    expect(transitionProposal("awaiting_client", "withdraw")).toBe("withdrawn");
    expect(transitionProposal("accepted", "withdraw")).toBeNull();
    expect(transitionProposal("withdrawn", "mark_ready")).toBeNull();
  });

  test("derives expiry without hiding editable drafts", () => {
    const now = new Date("2027-01-02T00:00:00Z");
    const past = new Date("2027-01-01T00:00:00Z");
    expect(effectiveProposalStatus("awaiting_client", past, now)).toBe("expired");
    expect(effectiveProposalStatus("ready", past, now)).toBe("ready");
    expect(canEditProposal("draft")).toBe(true);
    expect(canEditProposal("awaiting_client")).toBe(false);
  });
});

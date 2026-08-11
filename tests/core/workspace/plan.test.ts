import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  DEFAULT_TRIAL_DAYS,
  resolveWorkspacePlan,
  trialEndsAt,
} from "../../../src/core/workspace/plan";

const NOW = Temporal.Instant.from("2026-08-11T12:00:00Z");

describe("resolveWorkspacePlan", () => {
  test("a plan with no expiry is served as-is", () => {
    const resolved = resolveWorkspacePlan({ plan: "pro", planExpiresAt: null }, NOW);
    expect(resolved.plan).toBe("pro");
    expect(resolved.grantedPlan).toBe("pro");
    expect(resolved.trial).toBeNull();
    expect(resolved.entitlements.meetingPolls).toBe(true);
  });

  test("a live trial serves the granted plan and counts down", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "pro", planExpiresAt: "2026-08-21T12:00:00Z" },
      NOW,
    );
    expect(resolved.plan).toBe("pro");
    expect(resolved.entitlements.customDomains).toBe(true);
    expect(resolved.trial).toEqual({
      endsAt: "2026-08-21T12:00:00Z",
      expired: false,
      daysRemaining: 10,
    });
  });

  test("rounds a partial day up, so the last day still reads as 1", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "pro", planExpiresAt: "2026-08-11T23:00:00Z" },
      NOW,
    );
    expect(resolved.trial?.daysRemaining).toBe(1);
    expect(resolved.trial?.expired).toBe(false);
  });

  test("an elapsed trial drops entitlements to free but remembers what was granted", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "pro", planExpiresAt: "2026-08-01T12:00:00Z" },
      NOW,
    );
    expect(resolved.plan).toBe("free");
    expect(resolved.grantedPlan).toBe("pro");
    expect(resolved.entitlements.meetingPolls).toBe(false);
    expect(resolved.entitlements.customDomains).toBe(false);
    expect(resolved.trial).toEqual({
      endsAt: "2026-08-01T12:00:00Z",
      expired: true,
      daysRemaining: 0,
    });
  });

  test("expiry is inclusive of the instant itself", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "pro", planExpiresAt: "2026-08-11T12:00:00Z" },
      NOW,
    );
    expect(resolved.trial?.expired).toBe(true);
    expect(resolved.plan).toBe("free");
  });

  test("business trials fall back to free just like pro", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "business", planExpiresAt: "2026-08-01T12:00:00Z" },
      NOW,
    );
    expect(resolved.plan).toBe("free");
    expect(resolved.entitlements.memberLimit).toBe(1);
  });

  // Honouring an expiry here would downgrade someone running their own server,
  // who has no billing relationship to lapse in the first place.
  test("a self-hosted installation is never put on a trial clock", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "self_hosted", planExpiresAt: "2020-01-01T00:00:00Z" },
      NOW,
    );
    expect(resolved.plan).toBe("self_hosted");
    expect(resolved.trial).toBeNull();
    expect(resolved.entitlements.customDomains).toBe(true);
  });

  test("an already-free workspace gains nothing and loses nothing from an expiry", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "free", planExpiresAt: "2020-01-01T00:00:00Z" },
      NOW,
    );
    expect(resolved.plan).toBe("free");
    expect(resolved.trial).toBeNull();
  });

  // A malformed timestamp must not become a free unlimited plan, nor silently
  // revoke a paying customer's access.
  test("an unparseable expiry leaves the stored plan standing", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "pro", planExpiresAt: "not-a-timestamp" },
      NOW,
    );
    expect(resolved.plan).toBe("pro");
    expect(resolved.trial).toBeNull();
  });
});

describe("trialEndsAt", () => {
  test("defaults to a year measured from the start instant", () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(365);
    expect(trialEndsAt(NOW)).toBe("2027-08-11T12:00:00Z");
  });

  test("accepts a shorter window for a trial you want to revisit sooner", () => {
    expect(trialEndsAt(NOW, 30)).toBe("2026-09-10T12:00:00Z");
  });

  test("round-trips through resolve as a live trial of the requested length", () => {
    const resolved = resolveWorkspacePlan(
      { plan: "pro", planExpiresAt: trialEndsAt(NOW, 365) },
      NOW,
    );
    expect(resolved.trial?.daysRemaining).toBe(365);
    expect(resolved.trial?.expired).toBe(false);
  });
});

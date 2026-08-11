import { describe, expect, test } from "bun:test";
import {
  canCompleteOnboarding,
  isOnboardingComplete,
  isOnboardingRequired,
  nextOnboardingStep,
  onboardingSteps,
  resumeOnboardingStep,
  type OnboardingFacts,
} from "../../../src/core/onboarding/steps";

/** A host one second after their first Google sign-in: workspace auto-created
 * with a placeholder slug, primary calendar seeded by the auth hook. */
function freshHost(overrides: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return {
    furthestStep: null,
    completedAt: null,
    workspace: { slug: "workspace-0a1b2c3d4e5f" },
    calendars: { connectedCount: 1, blockingCount: 0, hasWriteDestination: true },
    scheduleCount: 0,
    eventTypeCount: 0,
    ...overrides,
  };
}

function readyHost(overrides: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return freshHost({
    furthestStep: "publish",
    workspace: { slug: "tourscale" },
    calendars: { connectedCount: 1, blockingCount: 1, hasWriteDestination: true },
    scheduleCount: 1,
    eventTypeCount: 1,
    ...overrides,
  });
}

describe("onboardingSteps", () => {
  test("a fresh host has nothing complete", () => {
    expect(onboardingSteps(freshHost())).toEqual([
      { id: "profile", complete: false },
      { id: "calendars", complete: false },
      { id: "link", complete: false },
      { id: "publish", complete: false },
    ]);
  });

  test("profile counts as answered once the host advances past it", () => {
    const steps = onboardingSteps(freshHost({ furthestStep: "calendars" }));
    expect(steps.find((step) => step.id === "profile")?.complete).toBe(true);
  });

  test("profile is not answered while the host is still standing on it", () => {
    const steps = onboardingSteps(freshHost({ furthestStep: "profile" }));
    expect(steps.find((step) => step.id === "profile")?.complete).toBe(false);
  });

  // The whole point of the calendar step: a connection that blocks nothing
  // still lets Calpaca offer slots on top of existing meetings.
  test("a connected calendar that blocks nothing leaves the step incomplete", () => {
    const facts = freshHost({
      calendars: { connectedCount: 2, blockingCount: 0, hasWriteDestination: true },
    });
    expect(onboardingSteps(facts).find((step) => step.id === "calendars")?.complete).toBe(false);
  });

  test("the calendar step needs a destination for the events Calpaca writes", () => {
    const facts = freshHost({
      calendars: { connectedCount: 1, blockingCount: 1, hasWriteDestination: false },
    });
    expect(onboardingSteps(facts).find((step) => step.id === "calendars")?.complete).toBe(false);
  });

  test("the link step is complete exactly when the placeholder slug is gone", () => {
    expect(onboardingSteps(freshHost()).find((s) => s.id === "link")?.complete).toBe(false);
    expect(
      onboardingSteps(freshHost({ workspace: { slug: "tourscale" } }))
        .find((s) => s.id === "link")?.complete,
    ).toBe(true);
  });

  test("publishing needs both a schedule and an event type", () => {
    const scheduleOnly = freshHost({ scheduleCount: 1, eventTypeCount: 0 });
    const eventTypeOnly = freshHost({ scheduleCount: 0, eventTypeCount: 1 });
    expect(onboardingSteps(scheduleOnly).find((s) => s.id === "publish")?.complete).toBe(false);
    expect(onboardingSteps(eventTypeOnly).find((s) => s.id === "publish")?.complete).toBe(false);
    expect(onboardingSteps(readyHost()).find((s) => s.id === "publish")?.complete).toBe(true);
  });
});

describe("nextOnboardingStep", () => {
  test("walks the steps in wizard order", () => {
    expect(nextOnboardingStep(freshHost())).toBe("profile");
    expect(nextOnboardingStep(freshHost({ furthestStep: "calendars" }))).toBe("calendars");
    expect(nextOnboardingStep(freshHost({
      furthestStep: "calendars",
      calendars: { connectedCount: 1, blockingCount: 1, hasWriteDestination: true },
    }))).toBe("link");
    expect(nextOnboardingStep(readyHost())).toBeNull();
  });
});

describe("resumeOnboardingStep", () => {
  test("returns to the furthest step while it is unfinished", () => {
    const facts = freshHost({
      furthestStep: "link",
      calendars: { connectedCount: 1, blockingCount: 1, hasWriteDestination: true },
    });
    expect(resumeOnboardingStep(facts)).toBe("link");
  });

  test("sends a host who deleted their event type back to the publish step", () => {
    expect(resumeOnboardingStep(readyHost({ eventTypeCount: 0 }))).toBe("publish");
  });

  test("never returns null, so the wizard always has somewhere to open", () => {
    expect(resumeOnboardingStep(readyHost())).toBe("publish");
  });
});

describe("completion", () => {
  test("completion is the explicit marker, not derived from data", () => {
    expect(isOnboardingComplete(readyHost())).toBe(false);
    expect(isOnboardingComplete(readyHost({ completedAt: "2026-08-11T12:00:00.000Z" }))).toBe(true);
  });

  // Without this, deleting the starter event type would drag a long-standing
  // host back through the first-run wizard.
  test("a finished host is never pulled back in, even after deleting the starter", () => {
    const finished = readyHost({ completedAt: "2026-08-11T12:00:00.000Z", eventTypeCount: 0 });
    expect(isOnboardingRequired(finished)).toBe(false);
  });

  test("an unfinished host with work left is redirected into the wizard", () => {
    expect(isOnboardingRequired(freshHost())).toBe(true);
    expect(isOnboardingRequired(readyHost())).toBe(false);
  });

  test("finishing requires a claimed link and something bookable", () => {
    expect(canCompleteOnboarding(freshHost())).toBe(false);
    expect(canCompleteOnboarding(readyHost({ workspace: { slug: "workspace-0a1b2c3d4e5f" } })))
      .toBe(false);
    expect(canCompleteOnboarding(readyHost({ eventTypeCount: 0 }))).toBe(false);
    expect(canCompleteOnboarding(readyHost())).toBe(true);
  });

  test("finishing does not require the calendar step, which a host may defer", () => {
    const noBlockingCalendar = readyHost({
      calendars: { connectedCount: 0, blockingCount: 0, hasWriteDestination: false },
    });
    expect(canCompleteOnboarding(noBlockingCalendar)).toBe(true);
  });
});

import { isGeneratedWorkspaceSlug } from "../workspace/slug";

/** The four decisions between a fresh Google sign-in and a booking link the
 * host is willing to send someone (docs/CALPACA-UX-STRATEGY.md, Workflow 1).
 * Order is the wizard order and is load-bearing: `nextOnboardingStep` returns
 * the first incomplete one. */
export const ONBOARDING_STEPS = ["profile", "calendars", "link", "publish"] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingFacts {
  /** Furthest step the host has reached, persisted so a reload resumes there.
   * null for a host who has never opened the wizard. */
  readonly furthestStep: OnboardingStepId | null;
  readonly completedAt: string | null;
  readonly workspace: { readonly slug: string };
  readonly calendars: {
    readonly connectedCount: number;
    /** Connections with conflictEnabled — the ones that actually block. */
    readonly blockingCount: number;
    readonly hasWriteDestination: boolean;
  };
  readonly scheduleCount: number;
  readonly eventTypeCount: number;
}

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly complete: boolean;
}

function stepIndex(step: OnboardingStepId | null): number {
  return step === null ? -1 : ONBOARDING_STEPS.indexOf(step);
}

/** Identity and timezone have no observable trace in the data — a host whose
 * zone really is UTC is indistinguishable from one who never answered — so this
 * step is complete once the host has advanced past it. Every other step is
 * derived from real rows, which keeps the wizard honest if a host deletes the
 * thing it created. */
function profileConfirmed(facts: OnboardingFacts): boolean {
  return stepIndex(facts.furthestStep) > stepIndex("profile");
}

export function onboardingSteps(facts: OnboardingFacts): readonly OnboardingStep[] {
  return [
    { id: "profile", complete: profileConfirmed(facts) },
    {
      id: "calendars",
      // A connection that blocks nothing is the failure mode this step exists
      // to prevent: slots would be offered on top of existing meetings.
      complete: facts.calendars.connectedCount > 0
        && facts.calendars.blockingCount > 0
        && facts.calendars.hasWriteDestination,
    },
    { id: "link", complete: !isGeneratedWorkspaceSlug(facts.workspace.slug) },
    {
      id: "publish",
      complete: facts.scheduleCount > 0 && facts.eventTypeCount > 0,
    },
  ];
}

export function nextOnboardingStep(facts: OnboardingFacts): OnboardingStepId | null {
  return onboardingSteps(facts).find((step) => !step.complete)?.id ?? null;
}

/** Where the wizard opens: the furthest step reached when it is still
 * incomplete, otherwise the first unfinished step. Resuming at the furthest
 * point avoids re-asking questions the host already answered, while a host who
 * later deletes their event type is sent back to fix exactly that. */
export function resumeOnboardingStep(facts: OnboardingFacts): OnboardingStepId {
  const steps = onboardingSteps(facts);
  const furthest = facts.furthestStep;
  if (furthest && !steps[stepIndex(furthest)]?.complete) return furthest;
  return nextOnboardingStep(facts) ?? ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]!;
}

/** Onboarding is done when the host explicitly finished it. Data-derived
 * completeness is deliberately not enough: finishing is an act, and without an
 * explicit marker every host who deletes their starter event type would be
 * dragged back through the wizard. */
export function isOnboardingComplete(facts: OnboardingFacts): boolean {
  return facts.completedAt !== null;
}

/** True when the host still has unfinished business AND has not dismissed the
 * wizard — the condition for redirecting into it after sign-in. */
export function isOnboardingRequired(facts: OnboardingFacts): boolean {
  return !isOnboardingComplete(facts) && nextOnboardingStep(facts) !== null;
}

/** Guard for the finish action: a host may finish early, but not before they
 * have something bookable, which is the whole point of the flow. */
export function canCompleteOnboarding(facts: OnboardingFacts): boolean {
  const steps = onboardingSteps(facts);
  return steps.find((step) => step.id === "publish")!.complete
    && steps.find((step) => step.id === "link")!.complete;
}

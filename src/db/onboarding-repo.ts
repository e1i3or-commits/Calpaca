import { and, count, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  ONBOARDING_STEPS,
  type OnboardingFacts,
  type OnboardingStepId,
} from "../core/onboarding/steps";
import { getDb } from "./client";
import * as schema from "./schema";
import { calendarConnections, eventTypes, schedules, users, workspaces } from "./schema";

type Db = NodePgDatabase<typeof schema>;

function asStepId(value: string | null): OnboardingStepId | null {
  return value !== null && (ONBOARDING_STEPS as readonly string[]).includes(value)
    ? value as OnboardingStepId
    : null;
}

/** Everything the step machine needs, in one round trip. Counts rather than
 * rows: the wizard only asks whether a thing exists, and the dashboard already
 * owns listing them. */
export async function getOnboardingFacts(
  userId: string,
  workspaceId: string,
  executor: Db = getDb(),
): Promise<OnboardingFacts | null> {
  const [[user], [workspace], [calendars], [scheduleCounts], [eventTypeCounts]] = await Promise.all([
    executor
      .select({
        step: users.onboardingStep,
        completedAt: users.onboardingCompletedAt,
      })
      .from(users)
      .where(eq(users.id, userId)),
    executor
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId)),
    executor
      .select({
        connectedCount: count(),
        blockingCount: sql<number>`count(*) filter (where ${calendarConnections.conflictEnabled})`
          .mapWith(Number),
        writeDestinationCount:
          sql<number>`count(*) filter (where ${calendarConnections.isWriteDestination})`
            .mapWith(Number),
      })
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, userId)),
    executor
      .select({ scheduleCount: count() })
      .from(schedules)
      .where(eq(schedules.userId, userId)),
    executor
      .select({ eventTypeCount: count() })
      .from(eventTypes)
      .where(and(
        eq(eventTypes.ownerUserId, userId),
        eq(eventTypes.workspaceId, workspaceId),
      )),
  ]);
  if (!user || !workspace) return null;

  const connectedCount = Number(calendars?.connectedCount ?? 0);
  return {
    furthestStep: asStepId(user.step),
    completedAt: user.completedAt?.toISOString() ?? null,
    workspace: { slug: workspace.slug },
    calendars: {
      connectedCount,
      blockingCount: Number(calendars?.blockingCount ?? 0),
      // The seeded "primary" connection is the write destination until the host
      // picks another, matching how /api/me/calendars reports it.
      hasWriteDestination: Number(calendars?.writeDestinationCount ?? 0) > 0
        || connectedCount > 0,
    },
    scheduleCount: Number(scheduleCounts?.scheduleCount ?? 0),
    eventTypeCount: Number(eventTypeCounts?.eventTypeCount ?? 0),
  };
}

/** Monotonic: a host stepping back to fix an earlier answer must not lose the
 * fact that they already answered the later ones. */
export async function recordOnboardingStep(
  userId: string,
  step: OnboardingStepId,
  executor: Db = getDb(),
): Promise<OnboardingStepId> {
  const [row] = await executor
    .select({ step: users.onboardingStep })
    .from(users)
    .where(eq(users.id, userId));
  const current = asStepId(row?.step ?? null);
  const furthest = ONBOARDING_STEPS.indexOf(step) > ONBOARDING_STEPS.indexOf(current ?? ONBOARDING_STEPS[0])
    || current === null
    ? step
    : current;
  await executor
    .update(users)
    .set({ onboardingStep: furthest, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return furthest;
}

export async function completeOnboarding(
  userId: string,
  now: Date = new Date(),
  executor: Db = getDb(),
): Promise<string> {
  const [row] = await executor
    .update(users)
    .set({
      onboardingCompletedAt: now,
      onboardingStep: ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1],
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning({ completedAt: users.onboardingCompletedAt });
  return (row?.completedAt ?? now).toISOString();
}

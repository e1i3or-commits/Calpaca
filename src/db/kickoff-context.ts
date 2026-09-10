import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { onboardingAttendance } from "../core/engagement/franchise-onboarding";
import { organizerFirst, sameRoster, type KickoffBookingError } from "../core/engagement/kickoff-booking";
import { getKickoffReadiness } from "./kickoff-readiness-repo";
import * as s from "./schema";
type Db = NodePgDatabase<typeof s>;

export async function loadKickoffContext(eventTypeId: string, db: Db) {
  const [row] = await db.select({ binding: s.onboardingKickoffs, onboarding: s.franchiseOnboarding, eventType: s.eventTypes, engagement: s.engagements })
    .from(s.onboardingKickoffs)
    .innerJoin(s.franchiseOnboarding, eq(s.franchiseOnboarding.id, s.onboardingKickoffs.onboardingId))
    .innerJoin(s.eventTypes, eq(s.eventTypes.id, s.onboardingKickoffs.eventTypeId))
    .innerJoin(s.engagements, eq(s.engagements.id, s.franchiseOnboarding.engagementId))
    .where(eq(s.onboardingKickoffs.eventTypeId, eventTypeId));
  return row ?? null;
}
export type KickoffContext = NonNullable<Awaited<ReturnType<typeof loadKickoffContext>>>;

export async function kickoffConfigurationIssue(ctx: KickoffContext, db: Db): Promise<KickoffBookingError | null> {
  const { eventType, onboarding, engagement } = ctx;
  const hosts = await db.select().from(s.eventTypeHosts).where(eq(s.eventTypeHosts.eventTypeId, eventType.id));
  const required = onboardingAttendance(onboarding.input).kickoff.map(host => host.userId);
  if (eventType.workspaceId !== onboarding.workspaceId || engagement.workspaceId !== onboarding.workspaceId
    || eventType.engagementId !== onboarding.engagementId || eventType.ownerUserId !== onboarding.input.organizerUserId
    || eventType.mode !== "group" || eventType.capacity !== 1 || eventType.durationMinutes !== onboarding.input.kickoffDurationMinutes
    || eventType.selectableDurations.length || eventType.publicSelectableHostIds.length || eventType.agentPolicy.enabled
    || !sameRoster(hosts.map(host => host.userId), required) || hosts.some(host => host.role !== "required")) return "kickoff_configuration_changed";
  return null;
}

export async function kickoffPubliclyAvailable(eventTypeId: string, db: Db) {
  const ctx = await loadKickoffContext(eventTypeId, db);
  if (!ctx) return true;
  if (!ctx.binding.publishedAt || ctx.eventType.playbookStatus !== "ready" || ctx.engagement.status !== "active") return false;
  if (await kickoffConfigurationIssue(ctx, db)) return false;
  return (await getKickoffReadiness(ctx.onboarding, db)).calendarSetupReady;
}

/** Transactions holding this share lock cannot race an Engagement pause or
 * roster/configuration edit into a confirmed kickoff. */
export async function lockKickoffContext(eventTypeId: string, db: Db) {
  const initial = await loadKickoffContext(eventTypeId, db);
  if (!initial) return null;
  await db.select({ id: s.engagements.id }).from(s.engagements)
    .where(and(eq(s.engagements.id, initial.onboarding.engagementId), eq(s.engagements.workspaceId, initial.onboarding.workspaceId))).for("share");
  await db.select({ id: s.eventTypes.id }).from(s.eventTypes).where(eq(s.eventTypes.id, eventTypeId)).for("share");
  return loadKickoffContext(eventTypeId, db);
}

export function kickoffHosts(ctx: KickoffContext) {
  return organizerFirst(onboardingAttendance(ctx.onboarding.input).kickoff.map(host => host.userId), ctx.onboarding.input.organizerUserId);
}

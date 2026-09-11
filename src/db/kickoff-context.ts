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
  if (row) return {...row, meetingKind: "kickoff" as const};
  const [followup] = await db.select({binding:s.onboardingFollowups,onboarding:s.franchiseOnboarding,eventType:s.eventTypes,engagement:s.engagements})
    .from(s.onboardingFollowups)
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId))
    .innerJoin(s.eventTypes,eq(s.eventTypes.id,s.onboardingFollowups.eventTypeId))
    .innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
    .where(eq(s.onboardingFollowups.eventTypeId,eventTypeId));
  return followup ? {...followup,binding:{...followup.binding,publishedAt:followup.binding.enabledAt},meetingKind:"followup" as const} : null;
}
export type KickoffContext = NonNullable<Awaited<ReturnType<typeof loadKickoffContext>>>;

export async function kickoffConfigurationIssue(ctx: KickoffContext, db: Db): Promise<KickoffBookingError | null> {
  const { eventType, onboarding, engagement } = ctx;
  const hosts = await db.select().from(s.eventTypeHosts).where(eq(s.eventTypeHosts.eventTypeId, eventType.id));
  const attendance = protectedAttendance(ctx);
  const required = attendance.map(host => host.userId);
  if (eventType.workspaceId !== onboarding.workspaceId || engagement.workspaceId !== onboarding.workspaceId
    || eventType.engagementId !== onboarding.engagementId || eventType.ownerUserId !== protectedOrganizer(ctx)
    || eventType.mode !== "group" || eventType.capacity !== 1 || eventType.durationMinutes !== 45
    || eventType.selectableDurations.length || eventType.publicSelectableHostIds.length || eventType.agentPolicy.enabled
    || !sameRoster(hosts.map(host => host.userId), required) || hosts.some(host => host.role !== attendance.find(person => person.userId === host.userId)?.role)) return "kickoff_configuration_changed";
  return null;
}

export async function kickoffPubliclyAvailable(eventTypeId: string, db: Db) {
  const ctx = await loadKickoffContext(eventTypeId, db);
  if (!ctx) return true;
  if (ctx.meetingKind === "followup") return false;
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
  return organizerFirst(protectedAttendance(ctx).filter(host => host.role === "required").map(host => host.userId), protectedOrganizer(ctx));
}

export function protectedAttendance(ctx: KickoffContext) {
  return onboardingAttendance(ctx.onboarding.input)[ctx.meetingKind === "followup" ? "followup" : "kickoff"];
}
export function protectedOrganizer(ctx: KickoffContext) {
  return ctx.meetingKind === "followup" ? ctx.onboarding.input.accountLeadUserId : ctx.onboarding.input.organizerUserId;
}

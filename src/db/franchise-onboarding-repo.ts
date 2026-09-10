import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canonicalOnboardingInput, franchiseOnboardingInput, onboardingAttendance, onboardingCadenceUpdate, type FranchiseOnboardingInput } from "../core/engagement/franchise-onboarding";
import type { EngagementActor } from "../core/engagement/permissions";
import { getDb } from "./client";
import { getEngagement, normalizeClientName } from "./engagement-repo";
import * as s from "./schema";
import { getKickoffReadiness } from "./kickoff-readiness-repo";
type Db = NodePgDatabase<typeof s>;
const admin = (actor: EngagementActor) => actor.workspaceRole === "owner" || actor.workspaceRole === "admin";

export function onboardingOutput(row: typeof s.franchiseOnboarding.$inferSelect) {
  return { id: row.id, engagementId: row.engagementId, sourceWorkspaceId: row.sourceWorkspaceId,
    sourceProjectKey: row.sourceProjectKey, locationKey: row.input.locationKey,
    franchiseeId: row.input.franchiseeId, businessUnitId: row.input.businessUnitId, primaryContactId: row.input.primaryContactId,
    accountLeadUserId: row.input.accountLeadUserId, workdriveFolderId: row.input.workdriveFolderId ?? null,
    cadence: row.cadence, revision: row.revision, attendance: row.attendance,
    kickoffDurationMinutes: row.input.kickoffDurationMinutes, followupDurationMinutes: row.input.followupDurationMinutes,
    organizerUserId: row.input.organizerUserId,
    kickoffBookingUrl: null, schedulingState: "not_published" as const,
    issues: ["kickoff_booking_not_published", "followup_scheduler_not_configured"],
  };
}

/** Local atomic create/reuse. No calendar, email, or external provider calls. */
export async function provisionFranchiseOnboarding(workspaceId: string, actor: EngagementActor, raw: FranchiseOnboardingInput, db: Db = getDb()) {
  if (!admin(actor)) return { kind: "forbidden" as const };
  const parsed = franchiseOnboardingInput.safeParse(raw);
  if (!parsed.success) return { kind: "invalid_input" as const };
  const input = canonicalOnboardingInput(parsed.data);
  return db.transaction(async tx => {
    const [workspace] = await tx.select().from(s.workspaces).where(eq(s.workspaces.id, workspaceId)).for("update");
    if (!workspace) return { kind: "not_found" as const };
    const [existing] = await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId),
      eq(s.franchiseOnboarding.sourceWorkspaceId, input.sourceWorkspaceId), eq(s.franchiseOnboarding.sourceProjectKey, input.sourceProjectKey)));
    if (existing) {
      const stored = canonicalOnboardingInput(franchiseOnboardingInput.parse(existing.input));
      if (JSON.stringify(stored) !== JSON.stringify(input)) return { kind: "source_conflict" as const };
      return { kind: "reused" as const, onboarding: onboardingOutput(existing) };
    }
    const successIds = input.franchiseSuccessUserIds;
    const attendance = onboardingAttendance(input);
    if (!successIds.includes(input.accountLeadUserId) || !attendance.kickoff.some(host => host.userId === input.organizerUserId))
      return { kind: "invalid_organizer_or_lead" as const };
    const ids = [...new Set([actor.userId, ...attendance.kickoff.map(host => host.userId)])];
    const members = await tx.select({ id: s.users.id }).from(s.workspaceMembers)
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(and(eq(s.workspaceMembers.workspaceId, workspaceId), eq(s.workspaceMembers.status, "active"), eq(s.users.status, "active"), inArray(s.users.id, ids)));
    if (members.length !== ids.length) return { kind: "invalid_participant" as const };

    // A CRM identity can reuse its mapped client; a matching display name alone cannot establish that identity.
    const [prior] = await tx.select({ clientId: s.engagements.clientId }).from(s.franchiseOnboarding)
      .innerJoin(s.engagements, and(eq(s.engagements.id, s.franchiseOnboarding.engagementId), eq(s.engagements.workspaceId, workspaceId)))
      .where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.franchiseOnboarding.franchiseeId, input.franchiseeId))).limit(1);
    if (prior && input.existingClientId && input.existingClientId !== prior.clientId) return { kind: "client_identity_conflict" as const };
    const clientId = prior?.clientId ?? input.existingClientId;
    let client: typeof s.clients.$inferSelect | undefined;
    if (clientId) {
      [client] = await tx.select().from(s.clients).where(and(eq(s.clients.workspaceId, workspaceId), eq(s.clients.id, clientId)));
      if (!client) return { kind: "invalid_client" as const };
      const otherMappings = await tx.select({ franchiseeId: s.franchiseOnboarding.franchiseeId }).from(s.franchiseOnboarding)
        .innerJoin(s.engagements, eq(s.engagements.id, s.franchiseOnboarding.engagementId))
        .where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.engagements.clientId, clientId)));
      if (otherMappings.some(row => row.franchiseeId !== input.franchiseeId)) return { kind: "client_identity_conflict" as const };
    } else {
      const normalizedName = normalizeClientName(input.clientName);
      const [sameName] = await tx.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.workspaceId, workspaceId), eq(s.clients.normalizedName, normalizedName)));
      if (sameName) return { kind: "client_identity_review_required" as const };
      [client] = await tx.insert(s.clients).values({ workspaceId, name: input.clientName, normalizedName, createdByUserId: actor.userId }).onConflictDoNothing().returning();
      if (!client) return { kind: "client_identity_review_required" as const };
    }
    const [engagement] = await tx.insert(s.engagements).values({ workspaceId, clientId: client.id,
      name: `${input.locationName} onboarding`, type: "project", status: "draft", visibility: "restricted",
      accountLeadUserId: input.accountLeadUserId, createdByUserId: actor.userId }).returning();
    if (!engagement) throw new Error("onboarding_engagement_not_created");
    await tx.insert(s.engagementPeople).values(ids.map(userId => ({ engagementId: engagement.id, userId,
      role: userId === input.accountLeadUserId ? "account_lead" : successIds.includes(userId) ? "franchise_success" : attendance.kickoff.some(host => host.userId === userId) ? "leadership" : "automation_creator" })));
    const [row] = await tx.insert(s.franchiseOnboarding).values({ workspaceId, sourceWorkspaceId: input.sourceWorkspaceId,
      sourceProjectKey: input.sourceProjectKey, engagementId: engagement.id, franchiseeId: input.franchiseeId, input, attendance }).returning();
    if (!row) throw new Error("onboarding_mapping_not_created");
    await tx.insert(s.franchiseOnboardingChanges).values({ workspaceId, onboardingId: row.id, actorUserId: actor.userId, revision: 1, kind: "created", cadence: row.cadence });
    return { kind: "created" as const, onboarding: onboardingOutput(row) };
  });
}

export async function getFranchiseOnboarding(workspaceId: string, actor: EngagementActor, sourceWorkspaceId: string, sourceProjectKey: string, db: Db = getDb()) {
  if (!admin(actor)) return { kind: "forbidden" as const };
  const [row] = await db.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId),
    eq(s.franchiseOnboarding.sourceWorkspaceId, sourceWorkspaceId), eq(s.franchiseOnboarding.sourceProjectKey, sourceProjectKey)));
  return row ? { kind: "found" as const, onboarding: { ...onboardingOutput(row), kickoffReadiness: await getKickoffReadiness(row, db) } } : { kind: "not_found" as const };
}

export async function updateOnboardingCadence(workspaceId: string, actor: EngagementActor, engagementId: string, raw: {revision: number; cadence: string}, db: Db = getDb()) {
  const parsed = onboardingCadenceUpdate.safeParse(raw);
  if (!parsed.success) return { kind: "invalid_input" as const };
  return db.transaction(async tx => {
    await tx.select({ id: s.workspaces.id }).from(s.workspaces).where(eq(s.workspaces.id, workspaceId)).for("update");
    await tx.select({id: s.engagements.id}).from(s.engagements).where(and(eq(s.engagements.workspaceId, workspaceId), eq(s.engagements.id, engagementId))).for("update");
    const engagement = await getEngagement(workspaceId, actor, engagementId, tx);
    if (!engagement) return { kind: "not_found" as const };
    if (!engagement.canManage) return { kind: "forbidden" as const };
    if (engagement.status === "archived" || engagement.status === "completed") return { kind: "engagement_closed" as const };
    const [row] = await tx.select().from(s.franchiseOnboarding).where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), eq(s.franchiseOnboarding.engagementId, engagementId)));
    if (!row) return { kind: "not_found" as const };
    if (row.revision !== parsed.data.revision) return { kind: "revision_conflict" as const };
    if (row.cadence === parsed.data.cadence) return { kind: "unchanged" as const, onboarding: onboardingOutput(row) };
    const [updated] = await tx.update(s.franchiseOnboarding).set({ cadence: parsed.data.cadence, revision: row.revision + 1, updatedAt: new Date() })
      .where(eq(s.franchiseOnboarding.id, row.id)).returning();
    await tx.insert(s.franchiseOnboardingChanges).values({ workspaceId, onboardingId: row.id, actorUserId: actor.userId, revision: updated!.revision, kind: "cadence_changed", cadence: updated!.cadence });
    await tx.update(s.engagements).set({ updatedAt: new Date() }).where(and(eq(s.engagements.workspaceId, workspaceId), eq(s.engagements.id, engagementId)));
    return { kind: "updated" as const, onboarding: onboardingOutput(updated!) };
  });
}

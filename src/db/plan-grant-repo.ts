import { Temporal } from "@js-temporal/polyfill";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WorkspacePlan } from "../core/workspace/entitlements";
import { trialEndsAt } from "../core/workspace/plan";
import { getDb } from "./client";
import * as schema from "./schema";
import { planGrants, users, workspaceMembers, workspaces } from "./schema";

type Db = NodePgDatabase<typeof schema>;

export interface PlanGrantRecord {
  readonly id: string;
  readonly email: string;
  readonly plan: WorkspacePlan;
  readonly trialDays: number;
  readonly status: "pending" | "claimed" | "revoked";
  readonly note: string | null;
  readonly claimedAt: Date | null;
  readonly createdAt: Date;
}

/** Records a trial for an address, replacing any earlier pending promise to the
 * same person so re-running the grant script is safe. Returns the stored grant.
 */
export async function upsertPlanGrant(
  input: {
    email: string;
    plan: WorkspacePlan;
    trialDays: number;
    note?: string | null;
    grantedByUserId?: string | null;
  },
  executor: Db = getDb(),
): Promise<PlanGrantRecord> {
  const email = input.email.trim().toLowerCase();
  return executor.transaction(async (tx) => {
    await tx
      .update(planGrants)
      .set({ status: "revoked" })
      .where(and(
        sql`lower(${planGrants.email}) = ${email}`,
        eq(planGrants.status, "pending"),
      ));
    const [row] = await tx.insert(planGrants).values({
      email,
      plan: input.plan,
      trialDays: input.trialDays,
      note: input.note ?? null,
      grantedByUserId: input.grantedByUserId ?? null,
    }).returning();
    return row as PlanGrantRecord;
  });
}

/** Applies a pending grant to the workspace this user owns. Called from
 * ensureWorkspaceForUser at first sign-in, and by the grant script for someone
 * who already has an account. Idempotent: a claimed grant is never reapplied,
 * so a tester cannot extend their own trial by signing out and back in.
 *
 * Runs inside the caller's transaction when given one — workspace creation and
 * the upgrade must not be separable, or a crash between them leaves a beta
 * tester silently on free. */
export async function claimPlanGrant(
  input: { userId: string; email: string; workspaceId: string },
  now: Temporal.Instant = Temporal.Now.instant(),
  executor: Db = getDb(),
): Promise<{ plan: WorkspacePlan; expiresAt: string } | null> {
  const email = input.email.trim().toLowerCase();
  const [grant] = await executor
    .select({
      id: planGrants.id,
      plan: planGrants.plan,
      trialDays: planGrants.trialDays,
    })
    .from(planGrants)
    .where(and(
      sql`lower(${planGrants.email}) = ${email}`,
      eq(planGrants.status, "pending"),
    ))
    .orderBy(desc(planGrants.createdAt))
    .limit(1);
  if (!grant) return null;

  const expiresAt = trialEndsAt(now, grant.trialDays);
  await executor
    .update(workspaces)
    .set({
      plan: grant.plan,
      planExpiresAt: new Date(expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, input.workspaceId));
  await executor
    .update(planGrants)
    .set({
      status: "claimed",
      claimedByUserId: input.userId,
      claimedWorkspaceId: input.workspaceId,
      claimedAt: new Date(),
    })
    .where(eq(planGrants.id, grant.id));
  return { plan: grant.plan, expiresAt };
}

export async function listPlanGrants(executor: Db = getDb()) {
  return executor
    .select({
      id: planGrants.id,
      email: planGrants.email,
      plan: planGrants.plan,
      trialDays: planGrants.trialDays,
      status: planGrants.status,
      note: planGrants.note,
      claimedAt: planGrants.claimedAt,
      createdAt: planGrants.createdAt,
      claimedWorkspaceSlug: workspaces.slug,
      planExpiresAt: workspaces.planExpiresAt,
    })
    .from(planGrants)
    .leftJoin(workspaces, eq(planGrants.claimedWorkspaceId, workspaces.id))
    .orderBy(desc(planGrants.createdAt));
}

export async function revokePlanGrant(email: string, executor: Db = getDb()) {
  const rows = await executor
    .update(planGrants)
    .set({ status: "revoked" })
    .where(and(
      sql`lower(${planGrants.email}) = ${email.trim().toLowerCase()}`,
      eq(planGrants.status, "pending"),
    ))
    .returning({ id: planGrants.id });
  return rows.length;
}

/** The workspace an existing account owns, so a grant can be applied to someone
 * who signed up before the invitation went out. Owner-only on purpose: a member
 * of somebody else's workspace has no workspace of their own to upgrade. */
export async function findOwnedWorkspace(
  email: string,
  executor: Db = getDb(),
): Promise<{ userId: string; workspaceId: string; slug: string } | null> {
  const [row] = await executor
    .select({
      userId: users.id,
      workspaceId: workspaces.id,
      slug: workspaces.slug,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(
      sql`lower(${users.email}) = ${email.trim().toLowerCase()}`,
      eq(workspaceMembers.role, "owner"),
    ))
    .limit(1);
  return row ?? null;
}

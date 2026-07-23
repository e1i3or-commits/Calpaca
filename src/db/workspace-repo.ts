import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { entitlementsFor, type WorkspacePlan } from "../core/workspace/entitlements";
import { getDb } from "./client";
import * as schema from "./schema";
import {
  users,
  workspaceDomains,
  workspaceMembers,
  workspaces,
} from "./schema";

type Db = NodePgDatabase<typeof schema>;
const DEFAULT_WORKSPACE_SLUG = "default";

function installationPlan(): WorkspacePlan {
  return process.env.CALPACA_DEPLOYMENT_MODE === "hosted" ? "free" : "self_hosted";
}

export async function ensureWorkspaceForUser(userId: string, executor: Db = getDb()) {
  return executor.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.createdAt))
      .limit(1);
    if (existing) return existing;

    const [user] = await tx
      .select({ role: users.appRole, name: users.name })
      .from(users)
      .where(eq(users.id, userId));
    const hosted = installationPlan() === "free";
    let [workspace] = hosted
      ? []
      : await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG))
          .limit(1);
    if (!workspace) {
      [workspace] = await tx
        .insert(workspaces)
        .values({
          name: hosted
            ? `${user?.name ?? "My"} workspace`
            : process.env.CALPACA_WORKSPACE_NAME ?? "Calpaca",
          slug: hosted
            ? `workspace-${crypto.randomUUID().slice(0, 12)}`
            : DEFAULT_WORKSPACE_SLUG,
          plan: installationPlan(),
        })
        .onConflictDoNothing()
        .returning();
      if (!workspace && !hosted) {
        [workspace] = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG))
          .limit(1);
      }
    }
    if (!workspace) throw new Error("default workspace could not be created");
    const role = hosted ? "owner" : user?.role ?? "member";
    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role,
    }).onConflictDoNothing();
    if (!hosted) {
      await tx
        .update(schema.userInvitations)
        .set({ workspaceId: workspace.id })
        .where(and(
          eq(schema.userInvitations.invitedByUserId, userId),
          eq(schema.userInvitations.status, "pending"),
          sql`${schema.userInvitations.workspaceId} is null`,
        ));
      await tx
        .update(schema.teams)
        .set({ workspaceId: workspace.id })
        .where(sql`${schema.teams.workspaceId} is null`);
    }
    return { workspaceId: workspace.id, role };
  });
}

export async function getWorkspaceContext(
  workspaceId: string,
  userId: string,
  executor: Db = getDb(),
) {
  const [row] = await executor
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
    ));
  return row ? { ...row, entitlements: entitlementsFor(row.plan) } : null;
}

export async function listWorkspaceDomains(workspaceId: string, executor: Db = getDb()) {
  return executor
    .select({
      id: workspaceDomains.id,
      hostname: workspaceDomains.hostname,
      status: workspaceDomains.status,
      isPrimary: workspaceDomains.isPrimary,
      createdAt: workspaceDomains.createdAt,
    })
    .from(workspaceDomains)
    .where(eq(workspaceDomains.workspaceId, workspaceId))
    .orderBy(asc(workspaceDomains.hostname));
}

export async function updateWorkspaceName(
  workspaceId: string,
  name: string,
  executor: Db = getDb(),
) {
  const [row] = await executor
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning({ id: workspaces.id, name: workspaces.name });
  return row ?? null;
}

export async function addWorkspaceDomain(
  workspaceId: string,
  hostname: string,
  executor: Db = getDb(),
) {
  const verificationToken = `calpaca-domain-${randomBytes(18).toString("base64url")}`;
  const [row] = await executor
    .insert(workspaceDomains)
    .values({ workspaceId, hostname, verificationToken })
    .returning();
  return { ...row!, dnsRecord: { type: "TXT" as const, name: `_calpaca.${hostname}`, value: verificationToken } };
}

export async function removeWorkspaceDomain(
  workspaceId: string,
  id: string,
  executor: Db = getDb(),
) {
  const rows = await executor
    .delete(workspaceDomains)
    .where(and(
      eq(workspaceDomains.workspaceId, workspaceId),
      eq(workspaceDomains.id, id),
    ))
    .returning({ id: workspaceDomains.id });
  return rows.length > 0;
}

export async function resolveWorkspaceByHostname(hostname: string, executor: Db = getDb()) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const [row] = await executor
    .select({ workspaceId: workspaceDomains.workspaceId })
    .from(workspaceDomains)
    .where(and(
      eq(workspaceDomains.hostname, normalized),
      eq(workspaceDomains.status, "verified"),
    ));
  return row?.workspaceId ?? null;
}

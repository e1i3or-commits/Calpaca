import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import {
  sessions,
  userInvitations,
  users,
  workspaceMembers,
} from "./schema";

type Db = NodePgDatabase<typeof schema>;
export type AppRole = "owner" | "admin" | "member";
export type UserStatus = "active" | "inactive";

export interface ManagedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly timezone: string;
  readonly role: AppRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
}

export interface UserInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: AppRole;
  readonly status: "pending" | "accepted" | "revoked";
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface ManagementDirectory {
  readonly actor: { readonly id: string; readonly role: AppRole };
  readonly users: readonly ManagedUser[];
  readonly invitations: readonly UserInvitation[];
}

async function actorRole(
  executor: Db,
  userId: string,
  workspaceId?: string,
): Promise<AppRole | null> {
  if (workspaceId) {
    const [membership] = await executor
      .select({ role: workspaceMembers.role, status: workspaceMembers.status })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ))
      .limit(1);
    return membership?.status === "active" ? membership.role : null;
  }
  return executor.transaction(async (tx) => {
    const [actor] = await tx
      .select({ role: users.appRole, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!actor || actor.status !== "active") return null;
    if (actor.role !== "member") return actor.role;

    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.appRole, "owner"))
      .limit(1);
    if (owner) return null;

    const [first] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, "active"))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1);
    if (first?.id !== userId) return null;
    await tx.update(users).set({ appRole: "owner" }).where(eq(users.id, userId));
    return "owner";
  });
}

export async function getManagementDirectory(
  userId: string,
  workspaceId?: string,
  executor: Db = getDb(),
): Promise<ManagementDirectory | null> {
  const role = await actorRole(executor, userId, workspaceId);
  if (!role) return null;
  if (workspaceId) {
    const [directory, invitations] = await Promise.all([
      executor
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          timezone: users.timezone,
          role: workspaceMembers.role,
          status: workspaceMembers.status,
          createdAt: workspaceMembers.createdAt,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .orderBy(asc(users.name), asc(users.email)),
      executor
        .select({
          id: userInvitations.id,
          email: userInvitations.email,
          role: userInvitations.role,
          status: userInvitations.status,
          expiresAt: userInvitations.expiresAt,
          createdAt: userInvitations.createdAt,
        })
        .from(userInvitations)
        .where(and(
          eq(userInvitations.workspaceId, workspaceId),
          eq(userInvitations.status, "pending"),
        ))
        .orderBy(asc(userInvitations.createdAt)),
    ]);
    return { actor: { id: userId, role }, users: directory, invitations };
  }
  const [directory, invitations] = await Promise.all([
    executor
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
        role: users.appRole,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.name), asc(users.email)),
    executor
      .select({
        id: userInvitations.id,
        email: userInvitations.email,
        role: userInvitations.role,
        status: userInvitations.status,
        expiresAt: userInvitations.expiresAt,
        createdAt: userInvitations.createdAt,
      })
      .from(userInvitations)
      .where(eq(userInvitations.status, "pending"))
      .orderBy(asc(userInvitations.createdAt)),
  ]);
  return { actor: { id: userId, role }, users: directory, invitations };
}

export async function createUserInvitation(
  actorId: string,
  email: string,
  role: AppRole,
  expiresAt: Date,
  workspaceId?: string,
  executor: Db = getDb(),
): Promise<{ invitation: UserInvitation; token: string; existingUser: boolean } | "forbidden" | "already_pending"> {
  const actor = await actorRole(executor, actorId, workspaceId);
  if (!actor || (role === "owner" && actor !== "owner")) return "forbidden";
  const normalizedEmail = email.trim().toLowerCase();

  return executor.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);
    if (existing) {
      if (workspaceId) {
        await tx.insert(workspaceMembers).values({
          workspaceId,
          userId: existing.id,
          role,
          status: "active",
        }).onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: { role, status: "active" },
        });
      } else {
        await tx
          .update(users)
          .set({ appRole: role, status: "active", updatedAt: new Date() })
          .where(eq(users.id, existing.id));
      }
    }

    const [pending] = await tx
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(and(
        sql`lower(${userInvitations.email}) = ${normalizedEmail}`,
        eq(userInvitations.status, "pending"),
      ))
      .limit(1);
    if (pending) return "already_pending";

    const token = crypto.randomUUID();
    const [invitation] = await tx
      .insert(userInvitations)
      .values({
        email: normalizedEmail,
        role,
        token,
        invitedByUserId: actorId,
        ...(workspaceId ? { workspaceId } : {}),
        expiresAt,
        ...(existing ? { status: "accepted" as const, acceptedAt: new Date() } : {}),
      })
      .returning({
        id: userInvitations.id,
        email: userInvitations.email,
        role: userInvitations.role,
        status: userInvitations.status,
        expiresAt: userInvitations.expiresAt,
        createdAt: userInvitations.createdAt,
      });
    return { invitation: invitation!, token, existingUser: Boolean(existing) };
  });
}

export async function updateManagedUser(
  actorId: string,
  targetId: string,
  patch: { role?: AppRole; status?: UserStatus },
  workspaceId?: string,
  executor: Db = getDb(),
): Promise<ManagedUser | "forbidden" | "not_found" | "self_deactivation" | "last_owner"> {
  const actor = await actorRole(executor, actorId, workspaceId);
  if (!actor) return "forbidden";
  if (workspaceId) {
    return executor.transaction(async (tx) => {
      const [target] = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          timezone: users.timezone,
          createdAt: workspaceMembers.createdAt,
          role: workspaceMembers.role,
          status: workspaceMembers.status,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetId),
        ));
      if (!target) return "not_found";
      if (target.role === "owner" && actor !== "owner") return "forbidden";
      if (patch.role === "owner" && actor !== "owner") return "forbidden";
      if (targetId === actorId && patch.status === "inactive") return "self_deactivation";
      const removesOwner = target.role === "owner"
        && (patch.role && patch.role !== "owner" || patch.status === "inactive");
      if (removesOwner) {
        const [otherOwner] = await tx
          .select({ id: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.role, "owner"),
            eq(workspaceMembers.status, "active"),
            ne(workspaceMembers.userId, targetId),
          ));
        if (!otherOwner) return "last_owner";
      }
      const [membership] = await tx
        .update(workspaceMembers)
        .set(patch)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, targetId),
        ))
        .returning({
          role: workspaceMembers.role,
          status: workspaceMembers.status,
        });
      return { ...target, ...membership! };
    });
  }
  return executor.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return "not_found";
    if (target.appRole === "owner" && actor !== "owner") return "forbidden";
    if (patch.role === "owner" && actor !== "owner") return "forbidden";
    if (targetId === actorId && patch.status === "inactive") return "self_deactivation";

    const removesOwner = target.appRole === "owner"
      && (patch.role && patch.role !== "owner" || patch.status === "inactive");
    if (removesOwner) {
      const [otherOwner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.appRole, "owner"),
          eq(users.status, "active"),
          ne(users.id, targetId),
        ))
        .limit(1);
      if (!otherOwner) return "last_owner";
    }

    const [updated] = await tx
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, targetId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
        role: users.appRole,
        status: users.status,
        createdAt: users.createdAt,
      });
    if (patch.status === "inactive") {
      await tx.delete(sessions).where(eq(sessions.userId, targetId));
    }
    return updated!;
  });
}

export async function revokeUserInvitation(
  actorId: string,
  invitationId: string,
  workspaceId?: string,
  executor: Db = getDb(),
): Promise<"revoked" | "forbidden" | "not_found"> {
  if (!(await actorRole(executor, actorId, workspaceId))) return "forbidden";
  const rows = await executor
    .update(userInvitations)
    .set({ status: "revoked" })
    .where(and(
      eq(userInvitations.id, invitationId),
      eq(userInvitations.status, "pending"),
      ...(workspaceId ? [eq(userInvitations.workspaceId, workspaceId)] : []),
    ))
    .returning({ id: userInvitations.id });
  return rows.length ? "revoked" : "not_found";
}

export async function claimUserInvitation(
  userId: string,
  email: string,
  executor: Db = getDb(),
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  await executor.transaction(async (tx) => {
    const [invitation] = await tx
      .select({
        id: userInvitations.id,
        role: userInvitations.role,
        workspaceId: userInvitations.workspaceId,
      })
      .from(userInvitations)
      .where(and(
        sql`lower(${userInvitations.email}) = ${normalizedEmail}`,
        eq(userInvitations.status, "pending"),
        sql`${userInvitations.expiresAt} > now()`,
      ))
      .limit(1);
    if (!invitation) return;
    if (invitation.workspaceId) {
      await tx.insert(workspaceMembers).values({
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
        status: "active",
      }).onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role: invitation.role, status: "active" },
      });
    }
    await tx
      .update(users)
      .set({ appRole: invitation.role, status: "active", updatedAt: new Date() })
      .where(eq(users.id, userId));
    await tx
      .update(userInvitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(userInvitations.id, invitation.id));
  });
}

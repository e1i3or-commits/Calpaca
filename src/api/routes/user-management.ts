import { Temporal } from "@js-temporal/polyfill";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  createUserInvitation,
  getManagementDirectory,
  revokeUserInvitation,
  updateManagedUser,
  type AppRole,
  type ManagementDirectory,
  type ManagedUser,
  type UserStatus,
} from "../../db/user-management-repo";
import { isMailerConfigured, sendInviteMail } from "../../notifications/mailer";

const roleSchema = z.enum(["owner", "admin", "member"]);
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: roleSchema,
});
const updateSchema = z.object({
  role: roleSchema.optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined);

type InviteResult =
  | { invitation: ManagementDirectory["invitations"][number]; token: string; existingUser: boolean }
  | "forbidden"
  | "already_pending";

export interface UserManagementDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly getDirectory: (userId: string) => Promise<ManagementDirectory | null>;
  readonly invite: (
    actorId: string,
    email: string,
    role: AppRole,
    expiresAt: Date,
  ) => Promise<InviteResult>;
  readonly updateUser: (
    actorId: string,
    targetId: string,
    patch: { role?: AppRole; status?: UserStatus },
  ) => Promise<ManagedUser | "forbidden" | "not_found" | "self_deactivation" | "last_owner">;
  readonly revokeInvitation: (
    actorId: string,
    invitationId: string,
  ) => Promise<"revoked" | "forbidden" | "not_found">;
  readonly sendMail: typeof sendInviteMail;
  readonly mailConfigured: () => boolean;
  readonly now: () => Temporal.Instant;
  readonly publicUrl: () => string | undefined;
}

const defaultDeps: UserManagementDeps = {
  requireAuth: requireSession,
  getDirectory: (userId) => getManagementDirectory(userId),
  invite: (actorId, email, role, expiresAt) =>
    createUserInvitation(actorId, email, role, expiresAt),
  updateUser: (actorId, targetId, patch) =>
    updateManagedUser(actorId, targetId, patch),
  revokeInvitation: (actorId, invitationId) =>
    revokeUserInvitation(actorId, invitationId),
  sendMail: sendInviteMail,
  mailConfigured: isMailerConfigured,
  now: () => Temporal.Now.instant(),
  publicUrl: () => process.env.PUBLIC_URL,
};

function serializeDirectory(directory: ManagementDirectory) {
  return {
    actor: directory.actor,
    users: directory.users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    })),
    invitations: directory.invitations.map((invitation) => ({
      ...invitation,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    })),
  };
}

function statusFor(result: string): 403 | 404 | 409 {
  if (result === "forbidden") return 403;
  if (result === "not_found") return 404;
  return 409;
}

export function createUserManagementRoutes(
  deps: UserManagementDeps = defaultDeps,
): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/user-management", deps.requireAuth);
  router.use("/api/me/user-management/*", deps.requireAuth);

  router.get("/api/me/user-management", async (c) => {
    const directory = await deps.getDirectory(c.get("user").id);
    if (!directory) return c.json({ error: "forbidden" }, 403);
    return c.json(serializeDirectory(directory));
  });

  router.post("/api/me/user-management/invitations", async (c) => {
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const expiresAt = deps.now().add({ hours: 7 * 24 });
    const result = await deps.invite(
      c.get("user").id,
      parsed.data.email,
      parsed.data.role,
      new Date(expiresAt.epochMilliseconds),
    );
    if (typeof result === "string") {
      return c.json({ error: result }, statusFor(result));
    }

    let delivery: "sent" | "not_configured" | "failed" | "existing_user" =
      result.existingUser ? "existing_user" : "not_configured";
    if (!result.existingUser && deps.mailConfigured()) {
      const signInUrl = `${deps.publicUrl() ?? ""}/sign-in?invitation=${encodeURIComponent(result.token)}`;
      try {
        await deps.sendMail({
          to: result.invitation.email,
          subject: "You're invited to Calpaca",
          text: `You've been invited to Calpaca as ${result.invitation.role}.\n\nSign in with this email address:\n${signInUrl}`,
          html: `<!doctype html><html lang="en"><body style="font-family:Arial,Helvetica,sans-serif;color:#24221f"><h1 style="font-size:22px">Join Calpaca</h1><p>You've been invited as <strong>${result.invitation.role}</strong>.</p><p><a href="${signInUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#18794e;color:#fff;text-decoration:none">Accept invitation</a></p><p style="color:#706b63;font-size:13px">Sign in with ${result.invitation.email}. This invitation expires in 7 days.</p></body></html>`,
        });
        delivery = "sent";
      } catch (error) {
        console.error("[user-management] invitation email failed:", error);
        delivery = "failed";
      }
    }
    return c.json({
      invitation: {
        ...result.invitation,
        expiresAt: result.invitation.expiresAt.toISOString(),
        createdAt: result.invitation.createdAt.toISOString(),
      },
      delivery,
    }, 201);
  });

  router.patch("/api/me/user-management/users/:id", async (c) => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const result = await deps.updateUser(c.get("user").id, c.req.param("id"), parsed.data);
    if (typeof result === "string") {
      return c.json({ error: result }, statusFor(result));
    }
    return c.json({ user: { ...result, createdAt: result.createdAt.toISOString() } });
  });

  router.delete("/api/me/user-management/invitations/:id", async (c) => {
    const result = await deps.revokeInvitation(c.get("user").id, c.req.param("id"));
    if (result !== "revoked") return c.json({ error: result }, statusFor(result));
    return c.json({ ok: true });
  });

  return router;
}

export const userManagementRoutes = createUserManagementRoutes();

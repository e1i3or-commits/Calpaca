import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  addWorkspaceDomain,
  getWorkspaceContext,
  listWorkspaceDomains,
  removeWorkspaceDomain,
  updateWorkspaceName,
} from "../../db/workspace-repo";

const hostnameSchema = z.string().trim().toLowerCase().max(253)
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
  .refine((hostname) => !["calpaca.io", "app.calpaca.io"].includes(hostname));

export interface WorkspaceDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly getContext: typeof getWorkspaceContext;
  readonly listDomains: typeof listWorkspaceDomains;
  readonly addDomain: typeof addWorkspaceDomain;
  readonly removeDomain: typeof removeWorkspaceDomain;
  readonly updateName: typeof updateWorkspaceName;
}

const defaultDeps: WorkspaceDeps = {
  requireAuth: requireSession,
  getContext: getWorkspaceContext,
  listDomains: listWorkspaceDomains,
  addDomain: addWorkspaceDomain,
  removeDomain: removeWorkspaceDomain,
  updateName: updateWorkspaceName,
};

function workspaceUser(c: { get: (key: "user") => AuthEnv["Variables"]["user"] }) {
  const user = c.get("user");
  return user.workspaceId ? { user, workspaceId: user.workspaceId } : null;
}

function canManage(role: string) {
  return role === "owner" || role === "admin";
}

export function createWorkspaceRoutes(deps: WorkspaceDeps = defaultDeps) {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/workspace", deps.requireAuth);
  router.use("/api/me/workspace/*", deps.requireAuth);

  router.get("/api/me/workspace", async (c) => {
    const actor = workspaceUser(c);
    if (!actor) return c.json({ error: "workspace_not_found" }, 404);
    const workspace = await deps.getContext(actor.workspaceId, actor.user.id);
    if (!workspace) return c.json({ error: "workspace_not_found" }, 404);
    const domains = await deps.listDomains(actor.workspaceId);
    return c.json({
      workspace,
      domains: domains.map((domain) => ({
        ...domain,
        createdAt: domain.createdAt.toISOString(),
      })),
      deploymentMode: process.env.CALPACA_DEPLOYMENT_MODE === "hosted"
        ? "hosted"
        : "self_hosted",
    });
  });

  router.patch("/api/me/workspace", async (c) => {
    const actor = workspaceUser(c);
    if (!actor || !canManage(actor.user.workspaceRole ?? "")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const parsed = z.object({ name: z.string().trim().min(1).max(100) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const workspace = await deps.updateName(actor.workspaceId, parsed.data.name);
    return workspace
      ? c.json({ workspace })
      : c.json({ error: "workspace_not_found" }, 404);
  });

  router.post("/api/me/workspace/domains", async (c) => {
    const actor = workspaceUser(c);
    if (!actor || !canManage(actor.user.workspaceRole ?? "")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const context = await deps.getContext(actor.workspaceId, actor.user.id);
    if (!context) return c.json({ error: "workspace_not_found" }, 404);
    if (!context.entitlements.customDomains) {
      return c.json({ error: "upgrade_required" }, 403);
    }
    const parsed = z.object({ hostname: hostnameSchema })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    try {
      const domain = await deps.addDomain(actor.workspaceId, parsed.data.hostname);
      return c.json({
        domain: {
          ...domain,
          createdAt: domain.createdAt.toISOString(),
        },
      }, 201);
    } catch {
      return c.json({ error: "domain_taken" }, 409);
    }
  });

  router.delete("/api/me/workspace/domains/:id", async (c) => {
    const actor = workspaceUser(c);
    if (!actor || !canManage(actor.user.workspaceRole ?? "")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const removed = await deps.removeDomain(actor.workspaceId, c.req.param("id"));
    return removed ? c.json({ ok: true }) : c.json({ error: "domain_not_found" }, 404);
  });
  return router;
}

export const workspaceRoutes = createWorkspaceRoutes();

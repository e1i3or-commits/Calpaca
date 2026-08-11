import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import { validateWorkspaceSlug } from "../../core/workspace/slug";
import {
  addWorkspaceDomain,
  getWorkspaceDomainForVerification,
  getWorkspaceContext,
  listWorkspaceDomains,
  removeWorkspaceDomain,
  markWorkspaceDomainVerified,
  updateWorkspaceName,
  updateWorkspaceSlug,
  workspaceSlugTaken,
} from "../../db/workspace-repo";
import { provisionCustomDomain } from "../../infra/npm-provisioner";

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
  readonly updateSlug?: typeof updateWorkspaceSlug;
  readonly slugTaken?: typeof workspaceSlugTaken;
  readonly getDomainForVerification?: typeof getWorkspaceDomainForVerification;
  readonly markDomainVerified?: typeof markWorkspaceDomainVerified;
  readonly resolveTxt?: (hostname: string) => Promise<string[][]>;
  readonly provisionDomain?: (hostname: string) => Promise<"provisioned" | "not_configured">;
}

const defaultDeps: WorkspaceDeps = {
  requireAuth: requireSession,
  getContext: getWorkspaceContext,
  listDomains: listWorkspaceDomains,
  addDomain: addWorkspaceDomain,
  removeDomain: removeWorkspaceDomain,
  updateName: updateWorkspaceName,
  updateSlug: updateWorkspaceSlug,
  slugTaken: workspaceSlugTaken,
  getDomainForVerification: getWorkspaceDomainForVerification,
  markDomainVerified: markWorkspaceDomainVerified,
  resolveTxt,
  provisionDomain: provisionCustomDomain,
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

  // Live feedback for the slug field, so a host learns "taken" or "reserved"
  // while typing rather than on submit. Rejections are 200 with a reason: an
  // unusable candidate is a normal answer here, not a failed request.
  router.get("/api/me/workspace/slug-available", async (c) => {
    const actor = workspaceUser(c);
    if (!actor) return c.json({ error: "workspace_not_found" }, 404);
    const validated = validateWorkspaceSlug(c.req.query("slug") ?? "");
    if (!validated.ok) {
      return c.json({ slug: null, available: false, reason: validated.error });
    }
    const context = await deps.getContext(actor.workspaceId, actor.user.id);
    if (context?.slug === validated.value) {
      return c.json({ slug: validated.value, available: true, reason: null });
    }
    const taken = await (deps.slugTaken ?? workspaceSlugTaken)(validated.value);
    return c.json({
      slug: validated.value,
      available: !taken,
      reason: taken ? "taken" : null,
    });
  });

  router.patch("/api/me/workspace", async (c) => {
    const actor = workspaceUser(c);
    if (!actor || !canManage(actor.user.workspaceRole ?? "")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const parsed = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      slug: z.string().trim().min(1).max(100).optional(),
    }).refine((body) => body.name !== undefined || body.slug !== undefined, {
      message: "at least one of name or slug is required",
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

    // The slug is in every public booking URL, so it is validated against the
    // same reserved-segment rules the router depends on before it is stored.
    if (parsed.data.slug !== undefined) {
      const validated = validateWorkspaceSlug(parsed.data.slug);
      if (!validated.ok) {
        return c.json({ error: "invalid_slug", reason: validated.error }, 400);
      }
      const updated = await (deps.updateSlug ?? updateWorkspaceSlug)(
        actor.workspaceId,
        validated.value,
      );
      if (updated === "slug_taken") return c.json({ error: "slug_taken" }, 409);
      if (!updated) return c.json({ error: "workspace_not_found" }, 404);
    }
    if (parsed.data.name === undefined) {
      const context = await deps.getContext(actor.workspaceId, actor.user.id);
      return context
        ? c.json({ workspace: { id: context.id, name: context.name, slug: context.slug } })
        : c.json({ error: "workspace_not_found" }, 404);
    }
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

  router.post("/api/me/workspace/domains/:id/verify", async (c) => {
    const actor = workspaceUser(c);
    if (!actor || !canManage(actor.user.workspaceRole ?? "")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const domain = await (deps.getDomainForVerification ?? getWorkspaceDomainForVerification)(
      actor.workspaceId,
      c.req.param("id"),
    );
    if (!domain) return c.json({ error: "domain_not_found" }, 404);
    let records: string[][];
    try {
      records = await (deps.resolveTxt ?? resolveTxt)(`_calpaca.${domain.hostname}`);
    } catch {
      return c.json({ error: "verification_record_not_found" }, 409);
    }
    if (!records.some((parts) => parts.join("") === domain.verificationToken)) {
      return c.json({ error: "verification_record_mismatch" }, 409);
    }
    const verified = await (deps.markDomainVerified ?? markWorkspaceDomainVerified)(
      actor.workspaceId,
      domain.id,
    );
    if (!verified) return c.json({ error: "domain_not_found" }, 404);
    try {
      const provisioning = await (deps.provisionDomain ?? provisionCustomDomain)(domain.hostname);
      return c.json({ domain: verified, provisioning });
    } catch {
      return c.json({
        domain: verified,
        provisioning: "failed",
        error: "certificate_provisioning_failed",
      }, 502);
    }
  });
  return router;
}

export const workspaceRoutes = createWorkspaceRoutes();

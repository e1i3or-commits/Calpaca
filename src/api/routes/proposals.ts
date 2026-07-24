import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  createProposal,
  getProposal,
  getPublicProposal,
  listEngagementProposals,
  requestProposalAlternative,
  transitionStoredProposal,
  updateProposal,
} from "../../db/proposal-repo";
import { enqueueProposalEmail } from "../../jobs/index";

const reasonSchema = z.object({
  kind: z.enum(["positive", "tradeoff", "warning"]),
  label: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(500),
});

const recommendationSchema = z.object({
  confidence: z.enum(["confirmed", "needs_confirmation", "unknown", "stale"]),
  evidenceCheckedAt: z.string().datetime().optional(),
  reasons: z.array(reasonSchema).min(2).max(4),
});

const inputSchema = z.object({
  eventTypeId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().max(2000).nullable(),
  recipientName: z.string().trim().min(1).max(160),
  recipientEmail: z.string().email(),
  expiresAt: z.string().datetime(),
  options: z.array(z.object({
    id: z.string().uuid().optional(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    hostUserIds: z.array(z.string().uuid()).min(1).max(20),
    recommendation: recommendationSchema,
  })).min(1).max(5),
}).superRefine((input, context) => {
  if (new Date(input.expiresAt) <= new Date()) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Expiry must be in the future.",
    });
  }
  input.options.forEach((option, index) => {
    if (new Date(option.end) <= new Date(option.start)) {
      context.addIssue({
        code: "custom",
        path: ["options", index, "end"],
        message: "Option end must follow its start.",
      });
    }
  });
});

export interface ProposalDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly list: typeof listEngagementProposals;
  readonly get: typeof getProposal;
  readonly create: typeof createProposal;
  readonly update: typeof updateProposal;
  readonly transition: typeof transitionStoredProposal;
  readonly publicGet: typeof getPublicProposal;
  readonly requestAlternative: typeof requestProposalAlternative;
  readonly enqueueEmail?: (publicId: string) => Promise<void>;
}

const defaultDeps: ProposalDeps = {
  requireAuth: requireSession,
  list: listEngagementProposals,
  get: getProposal,
  create: createProposal,
  update: updateProposal,
  transition: transitionStoredProposal,
  publicGet: getPublicProposal,
  requestAlternative: requestProposalAlternative,
  enqueueEmail: enqueueProposalEmail,
};

function context(c: { get: (key: "user") => AuthEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user.workspaceId || !user.workspaceRole) return null;
  return {
    workspaceId: user.workspaceId,
    actor: { userId: user.id, workspaceRole: user.workspaceRole },
  };
}

function input(parsed: z.infer<typeof inputSchema>) {
  return {
    ...parsed,
    expiresAt: new Date(parsed.expiresAt),
    options: parsed.options.map((option) => ({
      ...option,
      id: option.id ?? crypto.randomUUID(),
    })),
  };
}

function mutationError(result: { kind: string; issues?: string[] }) {
  if (result.kind === "not_found") return { body: { error: "proposal_not_found" }, status: 404 as const };
  if (result.kind === "conversation_not_found") {
    return { body: { error: "conversation_not_found" }, status: 404 as const };
  }
  if (result.kind === "forbidden") return { body: { error: "forbidden" }, status: 403 as const };
  if (result.kind === "conversation_not_ready") {
    return { body: { error: "conversation_not_ready" }, status: 409 as const };
  }
  if (result.kind === "not_ready") {
    return {
      body: { error: "proposal_not_ready", issues: result.issues ?? [] },
      status: 409 as const,
    };
  }
  if (result.kind === "invalid_options") {
    return { body: { error: "invalid_options" }, status: 400 as const };
  }
  return { body: { error: "invalid_transition" }, status: 409 as const };
}

export function createProposalRoutes(deps: ProposalDeps = defaultDeps) {
  const router = new Hono<AuthEnv>();
  router.use("/api/me/engagements/:engagementId/proposals", deps.requireAuth);
  router.use("/api/me/engagements/:engagementId/proposals/*", deps.requireAuth);
  router.use("/api/me/proposals/:proposalId", deps.requireAuth);
  router.use("/api/me/proposals/:proposalId/*", deps.requireAuth);

  router.get("/api/me/engagements/:engagementId/proposals", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.list(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
    );
    return result
      ? c.json(result)
      : c.json({ error: "engagement_not_found" }, 404);
  });

  router.post("/api/me/engagements/:engagementId/proposals", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({
        error: "invalid_body",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      }, 400);
    }
    const result = await deps.create(
      current.workspaceId,
      current.actor,
      c.req.param("engagementId"),
      input(parsed.data),
    );
    if (result.kind !== "created") {
      const error = mutationError(result);
      return c.json(error.body, error.status);
    }
    return c.json({ proposal: result.proposal }, 201);
  });

  router.get("/api/me/proposals/:proposalId", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.get(
      current.workspaceId,
      current.actor,
      c.req.param("proposalId"),
    );
    return result
      ? c.json(result)
      : c.json({ error: "proposal_not_found" }, 404);
  });

  router.patch("/api/me/proposals/:proposalId", async (c) => {
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({
        error: "invalid_body",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      }, 400);
    }
    const result = await deps.update(
      current.workspaceId,
      current.actor,
      c.req.param("proposalId"),
      input(parsed.data),
    );
    if (result.kind !== "updated") {
      const error = mutationError(result);
      return c.json(error.body, error.status);
    }
    return c.json({ proposal: result.proposal });
  });

  router.post("/api/me/proposals/:proposalId/:action", async (c) => {
    const action = c.req.param("action");
    const actionMap = {
      ready: "mark_ready",
      draft: "return_to_draft",
      approve: "approve",
      send: "send",
      withdraw: "withdraw",
    } as const;
    const proposalAction = actionMap[action as keyof typeof actionMap];
    if (!proposalAction) return c.json({ error: "not_found" }, 404);
    const current = context(c);
    if (!current) return c.json({ error: "workspace_not_found" }, 404);
    const result = await deps.transition(
      current.workspaceId,
      current.actor,
      c.req.param("proposalId"),
      proposalAction,
    );
    if (result.kind !== "updated") {
      const error = mutationError(result);
      return c.json(error.body, error.status);
    }
    if (proposalAction === "send") {
      await deps.enqueueEmail?.(result.proposal.publicId);
    }
    return c.json({ proposal: result.proposal });
  });

  router.get("/api/public/proposals/:publicId", async (c) => {
    const proposal = await deps.publicGet(c.req.param("publicId"));
    if (!proposal) return c.json({ error: "proposal_not_found" }, 404);
    return c.json({
      publicId: proposal.publicId,
      status: proposal.status,
      title: proposal.title,
      message: proposal.message,
      recipientName: proposal.recipientName,
      engagementName: proposal.engagementName,
      clientName: proposal.clientName,
      conversationTitle: proposal.conversationTitle,
      purpose: proposal.purpose,
      preparationItems: proposal.preparationItems,
      workspaceName: proposal.workspaceName,
      workspaceSlug: proposal.workspaceSlug,
      eventTypeSlug: proposal.eventTypeSlug,
      options: proposal.options,
      participants: proposal.participants,
      expiresAt: proposal.expiresAt.toISOString(),
      acceptedOptionId: proposal.acceptedOptionId,
      bookingId: proposal.bookingId,
    });
  });

  router.post("/api/public/proposals/:publicId/request-alternative", async (c) => {
    const parsed = z.object({
      request: z.string().trim().min(3).max(2000),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const result = await deps.requestAlternative(
      c.req.param("publicId"),
      parsed.data.request,
    );
    return result
      ? c.json({ ok: true })
      : c.json({ error: "proposal_unavailable" }, 409);
  });

  return router;
}

export const proposalRoutes = createProposalRoutes();

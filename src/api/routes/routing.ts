import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { requireSession, type AuthEnv } from "../../auth/session";
import type { Condition } from "../../core/routing/condition";
import { evaluateRouting } from "../../core/routing/evaluate";
import { validateAnswers } from "../../core/routing/form";
import {
  createRoutingForm,
  deleteRoutingForm,
  getEventTypeSlugById,
  getRoutingFormBySlug,
  listRoutingFormsForUser,
  updateRoutingForm,
  type RoutingFormInput,
  type RoutingFormRecord,
} from "../../db/routing-repo";
import { isTeamMember } from "../../db/admin-repo";

/** Routing forms: a public form whose answers pick the event type (and
 * optionally the host) via the rules AST in src/core/routing. Public surface
 * exposes fields only — rules stay private to the form's owners. */
export interface RoutingDeps {
  readonly requireAuth: MiddlewareHandler<AuthEnv>;
  readonly getRoutingFormBySlug: (slug: string) => Promise<RoutingFormRecord | null>;
  readonly getEventTypeSlugById: (id: string) => Promise<string | null>;
  readonly listRoutingFormsForUser: (userId: string) => Promise<RoutingFormRecord[]>;
  readonly createRoutingForm: (
    ownerUserId: string,
    input: RoutingFormInput,
  ) => Promise<RoutingFormRecord | "slug_taken">;
  readonly updateRoutingForm: (
    id: string,
    userId: string,
    input: RoutingFormInput,
  ) => Promise<RoutingFormRecord | null | "slug_taken">;
  readonly deleteRoutingForm: (id: string, userId: string) => Promise<"deleted" | "not_found">;
  readonly isTeamMember: (teamId: string, userId: string) => Promise<boolean>;
}

const defaultDeps: RoutingDeps = {
  requireAuth: requireSession,
  getRoutingFormBySlug: (slug) => getRoutingFormBySlug(slug),
  getEventTypeSlugById: (id) => getEventTypeSlugById(id),
  listRoutingFormsForUser: (userId) => listRoutingFormsForUser(userId),
  createRoutingForm: (ownerUserId, input) => createRoutingForm(ownerUserId, input),
  updateRoutingForm: (id, userId, input) => updateRoutingForm(id, userId, input),
  deleteRoutingForm: (id, userId) => deleteRoutingForm(id, userId),
  isTeamMember: (teamId, userId) => isTeamMember(teamId, userId),
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("always") }),
    z.object({ kind: z.literal("eq"), field: z.string().min(1), value: z.string() }),
    z.object({ kind: z.literal("ne"), field: z.string().min(1), value: z.string() }),
    z.object({ kind: z.literal("contains"), field: z.string().min(1), value: z.string().min(1) }),
    z.object({ kind: z.literal("in"), field: z.string().min(1), values: z.array(z.string()).min(1) }),
    z.object({ kind: z.literal("and"), all: z.array(conditionSchema).max(20) }),
    z.object({ kind: z.literal("or"), any: z.array(conditionSchema).max(20) }),
    z.object({ kind: z.literal("not"), not: conditionSchema }),
  ]),
);

const fieldSchema = z
  .object({
    key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "snake_case keys"),
    label: z.string().min(1).max(200),
    type: z.enum(["text", "email", "select", "multiselect"]),
    required: z.boolean(),
    options: z.array(z.string().min(1).max(100)).max(50).optional(),
  })
  .refine((f) => !["select", "multiselect"].includes(f.type) || (f.options?.length ?? 0) > 0, {
    message: "select fields need options",
  });

const ruleSchema = z
  .object({
    priority: z.number().int().min(0).max(1000),
    condition: conditionSchema,
    targetEventTypeId: z.string().uuid().nullable(),
    targetHostUserId: z.string().uuid().nullable(),
  })
  .refine((r) => r.targetEventTypeId !== null || r.targetHostUserId !== null, {
    message: "a rule needs a target",
  });

const formBodySchema = z
  .object({
    slug: z.string().min(1).max(80).regex(SLUG_RE, "kebab-case only"),
    teamId: z.string().uuid().nullable(),
    fields: z.array(fieldSchema).min(1).max(20),
    rules: z.array(ruleSchema).max(50),
  })
  .refine((f) => new Set(f.fields.map((x) => x.key)).size === f.fields.length, {
    message: "field keys must be unique",
  });

const answersSchema = z.record(z.string(), z.union([z.string().max(1000), z.array(z.string().max(200)).max(50)]));

const evaluateBodySchema = z.object({
  slug: z.string().min(1),
  answers: answersSchema,
});

export function createRoutingRoutes(deps: RoutingDeps = defaultDeps): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.use("/api/me/routing-forms", deps.requireAuth);
  router.use("/api/me/routing-forms/*", deps.requireAuth);

  // ---- public ----

  router.get("/routing/:slug", async (c) => {
    const form = await deps.getRoutingFormBySlug(c.req.param("slug"));
    if (!form) return c.json({ error: "form_not_found" }, 404);
    // rules are private: only the shape the invitee needs to fill in
    return c.json({ slug: form.slug, fields: form.fields });
  });

  router.post("/routing/evaluate", async (c) => {
    const parsed = evaluateBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

    const form = await deps.getRoutingFormBySlug(parsed.data.slug);
    if (!form) return c.json({ error: "form_not_found" }, 404);

    const validated = validateAnswers(form.fields, parsed.data.answers);
    if (!validated.ok) return c.json({ error: "invalid_answers", issues: validated.error }, 400);

    const match = evaluateRouting(form.rules, validated.value);
    if (!match) return c.json({ matched: false });

    const eventTypeSlug = match.targetEventTypeId
      ? await deps.getEventTypeSlugById(match.targetEventTypeId)
      : null;
    return c.json({
      matched: true,
      eventTypeSlug,
      hostUserId: match.targetHostUserId,
      answers: validated.value, // normalized; carried to the booking
    });
  });

  // ---- admin ----

  router.get("/api/me/routing-forms", async (c) => {
    return c.json({ forms: await deps.listRoutingFormsForUser(c.get("user").id) });
  });

  router.post("/api/me/routing-forms", async (c) => {
    const parsed = formBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    if (parsed.data.teamId && !(await deps.isTeamMember(parsed.data.teamId, user.id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const result = await deps.createRoutingForm(user.id, parsed.data);
    if (result === "slug_taken") return c.json({ error: "slug_taken" }, 409);
    return c.json(result, 201);
  });

  router.put("/api/me/routing-forms/:id", async (c) => {
    const parsed = formBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    if (parsed.data.teamId && !(await deps.isTeamMember(parsed.data.teamId, user.id))) {
      return c.json({ error: "team_not_found" }, 404);
    }
    const result = await deps.updateRoutingForm(c.req.param("id"), user.id, parsed.data);
    if (result === null) return c.json({ error: "form_not_found" }, 404);
    if (result === "slug_taken") return c.json({ error: "slug_taken" }, 409);
    return c.json(result);
  });

  router.delete("/api/me/routing-forms/:id", async (c) => {
    const result = await deps.deleteRoutingForm(c.req.param("id"), c.get("user").id);
    if (result === "not_found") return c.json({ error: "form_not_found" }, 404);
    return c.json({ ok: true });
  });

  return router;
}

export const routingRoutes = createRoutingRoutes();

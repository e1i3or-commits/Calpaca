import { describe, expect, test } from "bun:test";
import { createRoutingRoutes, type RoutingDeps } from "../../src/api/routes/routing";
import type { RoutingFormInput, RoutingFormRecord } from "../../src/db/routing-repo";

const U1 = "11111111-1111-4111-8111-111111111111";
const FORM_ID = "22222222-2222-4222-8222-222222222222";
const ET_ENTERPRISE = "33333333-3333-4333-8333-333333333333";
const ET_GENERAL = "44444444-4444-4444-8444-444444444444";
const OTHER_TEAM = "55555555-5555-4555-8555-555555555555";

const form: RoutingFormRecord = {
  id: FORM_ID,
  ownerUserId: U1,
  teamId: null,
  slug: "contact-sales",
  title: "Talk to sales",
  description: "Two questions, then a time.",
  theme: "midnight",
  fields: [
    { key: "size", label: "Company size", type: "select", required: true, options: ["1-10", "100+"] },
    { key: "notes", label: "Notes", type: "text", required: false },
  ],
  rules: [
    {
      id: "r-1",
      priority: 1,
      condition: { kind: "eq", field: "size", value: "100+" },
      targetEventTypeId: ET_ENTERPRISE,
      targetHostUserId: null,
    },
    {
      id: "r-2",
      priority: 100,
      condition: { kind: "always" },
      targetEventTypeId: ET_GENERAL,
      targetHostUserId: null,
    },
  ],
};

const validBody = {
  slug: "contact-sales",
  teamId: null,
  fields: [
    { key: "size", label: "Company size", type: "select", required: true, options: ["1-10", "100+"] },
  ],
  rules: [
    {
      priority: 1,
      condition: { kind: "eq", field: "size", value: "100+" },
      targetEventTypeId: ET_ENTERPRISE,
      targetHostUserId: null,
    },
  ],
};

function makeDeps(overrides: Partial<RoutingDeps> = {}): RoutingDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: U1, email: "host@example.test", name: "Host" });
      await next();
    },
    getRoutingFormBySlug: async (slug) => (slug === "contact-sales" ? form : null),
    getEventTypeSlugById: async (id) =>
      id === ET_ENTERPRISE ? "enterprise-call" : id === ET_GENERAL ? "general-call" : null,
    listRoutingFormsForUser: async () => [form],
    createRoutingForm: async (_owner, input) => (input.slug === "contact-sales" ? "slug_taken" : { ...form, ...input, rules: form.rules }),
    updateRoutingForm: async (id, _userId, input) => (id === FORM_ID ? { ...form, ...input, rules: form.rules } : null),
    deleteRoutingForm: async (id) => (id === FORM_ID ? "deleted" : "not_found"),
    isTeamMember: async (teamId) => teamId !== OTHER_TEAM,
    ...overrides,
  };
}

describe("public routing surface", () => {
  test("GET /routing/:slug returns fields but never rules", async () => {
    const router = createRoutingRoutes(makeDeps());
    const res = await router.request("/routing/contact-sales");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.slug).toBe("contact-sales");
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.rules).toBeUndefined();
    // presentation travels with the public read so the page styles itself
    expect(body.title).toBe("Talk to sales");
    expect(body.description).toBe("Two questions, then a time.");
    expect(body.theme).toBe("midnight");

    expect((await router.request("/routing/nope")).status).toBe(404);
  });

  test("a hand-edited theme name renders as the default rather than unstyled", async () => {
    const router = createRoutingRoutes(
      makeDeps({ getRoutingFormBySlug: async () => ({ ...form, theme: "not-a-theme" }) }),
    );
    const body = (await (await router.request("/routing/contact-sales")).json()) as { theme: string };
    expect(body.theme).toBe("default");
  });

  test("an untitled form reports null so the page can fall back to the slug", async () => {
    const router = createRoutingRoutes(
      makeDeps({ getRoutingFormBySlug: async () => ({ ...form, title: null, description: null }) }),
    );
    const body = (await (await router.request("/routing/contact-sales")).json()) as Record<string, unknown>;
    expect(body.title).toBeNull();
    expect(body.description).toBeNull();
  });

  test("evaluate routes by rule priority and resolves the event type slug", async () => {
    const router = createRoutingRoutes(makeDeps());
    const res = await router.request("/routing/evaluate", {
      method: "POST",
      body: JSON.stringify({ slug: "contact-sales", answers: { size: "100+" } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matched: boolean; eventTypeSlug: string; answers: unknown };
    expect(body.matched).toBe(true);
    expect(body.eventTypeSlug).toBe("enterprise-call");
    expect(body.answers).toEqual({ size: "100+" });

    const fallthrough = await router.request("/routing/evaluate", {
      method: "POST",
      body: JSON.stringify({ slug: "contact-sales", answers: { size: "1-10" } }),
    });
    expect(((await fallthrough.json()) as { eventTypeSlug: string }).eventTypeSlug).toBe("general-call");
  });

  test("evaluate rejects invalid answers with field-level issues", async () => {
    const router = createRoutingRoutes(makeDeps());
    const res = await router.request("/routing/evaluate", {
      method: "POST",
      body: JSON.stringify({ slug: "contact-sales", answers: { size: "500+" } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { field: string; reason: string }[] };
    expect(body.error).toBe("invalid_answers");
    expect(body.issues[0]).toEqual({ field: "size", reason: "not_an_option" });
  });

  test("evaluate reports matched: false when no rule fires", async () => {
    const noRules = { ...form, rules: [] };
    const router = createRoutingRoutes(makeDeps({ getRoutingFormBySlug: async () => noRules }));
    const res = await router.request("/routing/evaluate", {
      method: "POST",
      body: JSON.stringify({ slug: "contact-sales", answers: { size: "1-10" } }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { matched: boolean }).matched).toBe(false);
  });
});

describe("routing admin surface", () => {
  test("requires a session", async () => {
    const router = createRoutingRoutes(
      makeDeps({ requireAuth: async (c) => c.json({ error: "unauthorized" }, 401) }),
    );
    expect((await router.request("/api/me/routing-forms")).status).toBe(401);
    expect(
      (await router.request(`/api/me/routing-forms/${FORM_ID}`, { method: "DELETE" })).status,
    ).toBe(401);
    // ...but the public surface stays open
    expect((await router.request("/routing/contact-sales")).status).toBe(200);
  });

  test("create validates the form shape", async () => {
    const router = createRoutingRoutes(makeDeps());

    const created = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({ ...validBody, slug: "new-form" }),
    });
    expect(created.status).toBe(201);

    const taken = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    expect(taken.status).toBe(409);

    const dupKeys = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({
        ...validBody,
        slug: "dup-keys",
        fields: [...validBody.fields, ...validBody.fields],
      }),
    });
    expect(dupKeys.status).toBe(400);

    const targetless = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({
        ...validBody,
        slug: "no-target",
        rules: [{ priority: 1, condition: { kind: "always" }, targetEventTypeId: null, targetHostUserId: null }],
      }),
    });
    expect(targetless.status).toBe(400);

    const optionless = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({
        ...validBody,
        slug: "no-options",
        fields: [{ key: "size", label: "Size", type: "select", required: true }],
      }),
    });
    expect(optionless.status).toBe(400);

    const foreignTeam = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({ ...validBody, slug: "foreign", teamId: OTHER_TEAM }),
    });
    expect(foreignTeam.status).toBe(404);

    const badTheme = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({ ...validBody, slug: "bad-theme", theme: "chartreuse" }),
    });
    expect(badTheme.status).toBe(400);
  });

  test("create persists presentation, and a body without it still validates", async () => {
    const seen: RoutingFormInput[] = [];
    const router = createRoutingRoutes(
      makeDeps({
        createRoutingForm: async (_owner, input) => {
          seen.push(input);
          return { ...form, ...input, rules: form.rules };
        },
      }),
    );

    const themed = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({
        ...validBody,
        slug: "themed",
        title: "Book time with us",
        description: "Two questions.",
        theme: "juniper",
      }),
    });
    expect(themed.status).toBe(201);
    expect(seen[0]).toMatchObject({
      title: "Book time with us",
      description: "Two questions.",
      theme: "juniper",
    });

    // the pre-theme contract: no title, description or theme in the body
    const bare = await router.request("/api/me/routing-forms", {
      method: "POST",
      body: JSON.stringify({ ...validBody, slug: "bare" }),
    });
    expect(bare.status).toBe(201);
    expect(seen[1]).toMatchObject({ title: null, description: null, theme: "default" });
  });

  test("update 404s outside scope; delete works once", async () => {
    const router = createRoutingRoutes(makeDeps());

    const missing = await router.request(`/api/me/routing-forms/${OTHER_TEAM}`, {
      method: "PUT",
      body: JSON.stringify(validBody),
    });
    expect(missing.status).toBe(404);

    expect(
      (await router.request(`/api/me/routing-forms/${FORM_ID}`, { method: "DELETE" })).status,
    ).toBe(200);
    expect(
      (await router.request(`/api/me/routing-forms/${OTHER_TEAM}`, { method: "DELETE" })).status,
    ).toBe(404);
  });
});

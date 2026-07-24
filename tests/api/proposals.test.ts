import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createProposalRoutes, type ProposalDeps } from "../../src/api/routes/proposals";

type ProposalResult = NonNullable<
  Awaited<ReturnType<ProposalDeps["get"]>>
>["proposal"];

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
  timezone: "UTC",
  appRole: "member" as const,
  workspaceId: "22222222-2222-4222-8222-222222222222",
  workspaceRole: "owner" as const,
  workspacePlan: "pro" as const,
};

const option = {
  id: "33333333-3333-4333-8333-333333333333",
  start: "2027-01-10T15:00:00.000Z",
  end: "2027-01-10T15:30:00.000Z",
  hostUserIds: ["44444444-4444-4444-8444-444444444444"],
  recommendation: {
    confidence: "confirmed" as const,
    evidenceCheckedAt: "2027-01-01T12:00:00.000Z",
    reasons: [{
      kind: "positive" as const,
      label: "Organizer calendar checked",
      detail: "Current evidence shows the organizer is available.",
    }, {
      kind: "positive" as const,
      label: "Fits the booking rules",
      detail: "This time satisfies the scheduling rules.",
    }],
  },
};

function app(overrides: Partial<ProposalDeps> = {}) {
  const proposal = {
    id: "55555555-5555-4555-8555-555555555555",
    publicId: "public-token",
    workspaceId: actor.workspaceId,
    engagementId: "66666666-6666-4666-8666-666666666666",
    eventTypeId: "77777777-7777-4777-8777-777777777777",
    ownerUserId: actor.id,
    title: "Acme kickoff",
    message: "Choose a kickoff time.",
    recipientName: "Maya",
    recipientEmail: "maya@example.test",
    options: [option, { ...option, id: "88888888-8888-4888-8888-888888888888", start: "2027-01-11T15:00:00.000Z", end: "2027-01-11T15:30:00.000Z" }],
    status: "draft" as const,
    expiresAt: new Date("2027-01-20T00:00:00.000Z"),
    sentAt: null,
    acceptedOptionId: null,
    alternativeRequest: null,
    bookingId: null,
    createdAt: new Date("2027-01-01T00:00:00.000Z"),
    updatedAt: new Date("2027-01-01T00:00:00.000Z"),
  };
  const deps = {
    requireAuth: async (c, next) => {
      c.set("user", actor);
      await next();
    },
    list: async () => ({ proposals: [proposal], canManage: true }),
    get: async () => ({
      proposal,
      engagement: { id: proposal.engagementId, name: "Website launch", clientName: "Acme" },
      conversation: { title: "Kickoff", purpose: "Align scope", preparationItems: [] },
      activity: [],
      canManage: true,
    }),
    create: async () => ({ kind: "created" as const, proposal }),
    update: async () => ({ kind: "updated" as const, proposal }),
    transition: async () => ({ kind: "updated" as const, proposal: { ...proposal, status: "ready" as const } }),
    publicGet: async () => ({
      ...proposal,
      status: "awaiting_client" as const,
      engagementName: "Website launch",
      clientName: "Acme",
      conversationTitle: "Kickoff",
      purpose: "Align scope",
      preparationItems: [],
      workspaceName: "Agency",
      workspaceSlug: "agency",
      eventTypeSlug: "kickoff",
      participants: [{ id: option.hostUserIds[0]!, name: "Kai", role: "required" }],
    }),
    requestAlternative: async () => ({ ...proposal, alternativeRequest: "Afternoons only" }),
    ...overrides,
  } satisfies ProposalDeps;
  const api = new Hono();
  api.route("/", createProposalRoutes(deps));
  return api;
}

describe("proposal routes", () => {
  test("creates a draft with deterministic option provenance", async () => {
    let received: unknown;
    const fixtureResponse = await app().request(
      "/api/me/proposals/55555555-5555-4555-8555-555555555555",
    );
    const fixture = await fixtureResponse.json() as { proposal: ProposalResult };
    const response = await app({
      create: async (_workspaceId, _actor, _engagementId, input) => {
        received = input;
        return {
          kind: "created",
          proposal: fixture.proposal,
        };
      },
    }).request("/api/me/engagements/66666666-6666-4666-8666-666666666666/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventTypeId: "77777777-7777-4777-8777-777777777777",
        title: "Acme kickoff",
        message: null,
        recipientName: "Maya",
        recipientEmail: "maya@example.test",
        expiresAt: "2099-01-20T00:00:00.000Z",
        options: [option, { ...option, id: undefined, start: "2027-01-11T15:00:00.000Z", end: "2027-01-11T15:30:00.000Z" }],
      }),
    });
    expect(response.status).toBe(201);
    const input = received as {
      recipientEmail: string;
      options: { id: string; recommendation: { confidence: string } }[];
    };
    expect(input.recipientEmail).toBe("maya@example.test");
    expect(input.options[0]?.recommendation.confidence).toBe("confirmed");
    expect(input.options[1]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("public response omits internal ownership and recipient email", async () => {
    const response = await app().request("/api/public/proposals/public-token");
    expect(response.status).toBe(200);
    const body = await response.json() as {
      recipientEmail?: string;
      ownerUserId?: string;
      workspaceId?: string;
      options: unknown[];
      participants: { name: string }[];
    };
    expect(body.recipientEmail).toBeUndefined();
    expect(body.ownerUserId).toBeUndefined();
    expect(body.workspaceId).toBeUndefined();
    expect(body.options).toHaveLength(2);
    expect(body.participants[0]?.name).toBe("Kai");
  });

  test("rejects alternative requests when the proposal is unavailable", async () => {
    const response = await app({
      requestAlternative: async () => null,
    }).request("/api/public/proposals/public-token/request-alternative", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: "Afternoons would work better." }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "proposal_unavailable" });
  });
});

import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  createUserManagementRoutes,
  type UserManagementDeps,
} from "../../src/api/routes/user-management";
import type { ManagementDirectory, ManagedUser } from "../../src/db/user-management-repo";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const createdAt = new Date("2026-07-01T12:00:00.000Z");

const managedUser: ManagedUser = {
  id: USER_ID,
  name: "Member",
  email: "member@example.test",
  timezone: "UTC",
  role: "member",
  status: "active",
  createdAt,
};

const directory: ManagementDirectory = {
  actor: { id: ACTOR_ID, role: "owner" },
  users: [managedUser],
  invitations: [],
};

function deps(overrides: Partial<UserManagementDeps> = {}): UserManagementDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: ACTOR_ID, email: "owner@example.test", name: "Owner" });
      await next();
    },
    getDirectory: async () => directory,
    invite: async (_actorId, email, role, expiresAt) => ({
      invitation: {
        id: INVITATION_ID,
        email,
        role,
        status: "pending",
        expiresAt,
        createdAt,
      },
      token: "invite-token",
      existingUser: false,
    }),
    updateUser: async (_actorId, _targetId, patch) => ({ ...managedUser, ...patch }),
    revokeInvitation: async () => "revoked",
    sendMail: async () => ({ rejected: [] }),
    mailConfigured: () => false,
    now: () => Temporal.Instant.from("2026-07-23T12:00:00Z"),
    publicUrl: () => "https://cal.example.test",
    ...overrides,
  };
}

describe("user management routes", () => {
  test("requires authentication and management permission", async () => {
    const unauthorized = createUserManagementRoutes(deps({
      requireAuth: async (c) => c.json({ error: "unauthorized" }, 401),
    }));
    expect((await unauthorized.request("/api/me/user-management")).status).toBe(401);

    const forbidden = createUserManagementRoutes(deps({ getDirectory: async () => null }));
    expect((await forbidden.request("/api/me/user-management")).status).toBe(403);
  });

  test("returns the role-aware directory with serialized dates", async () => {
    const response = await createUserManagementRoutes(deps())
      .request("/api/me/user-management");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      actor: directory.actor,
      users: [{ ...managedUser, createdAt: createdAt.toISOString() }],
      invitations: [],
    });
  });

  test("creates a seven-day invitation and reports mail delivery", async () => {
    let expiry: Date | undefined;
    let deliveredTo: string | undefined;
    const custom = deps({
      mailConfigured: () => true,
      invite: async (_actorId, email, role, expiresAt) => {
        expiry = expiresAt;
        return {
          invitation: {
            id: INVITATION_ID,
            email,
            role,
            status: "pending",
            expiresAt,
            createdAt,
          },
          token: "secret token",
          existingUser: false,
        };
      },
      sendMail: async (mail) => {
        deliveredTo = mail.to;
        expect(mail.html).toContain("invitation=secret%20token");
        return { rejected: [] };
      },
    });
    const response = await createUserManagementRoutes(custom).request(
      "/api/me/user-management/invitations",
      {
        method: "POST",
        body: JSON.stringify({ email: "New@Example.test", role: "admin" }),
      },
    );
    expect(response.status).toBe(201);
    expect(expiry?.toISOString()).toBe("2026-07-30T12:00:00.000Z");
    expect(deliveredTo).toBe("New@Example.test");
    expect(((await response.json()) as { delivery: string }).delivery).toBe("sent");
  });

  test("validates updates and maps lifecycle conflicts", async () => {
    const routes = createUserManagementRoutes(deps({
      updateUser: async () => "last_owner",
    }));
    const empty = await routes.request(`/api/me/user-management/users/${USER_ID}`, {
      method: "PATCH",
      body: "{}",
    });
    expect(empty.status).toBe(400);

    const conflict = await routes.request(`/api/me/user-management/users/${USER_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "inactive" }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "last_owner" });
  });

  test("revokes pending invitations", async () => {
    const response = await createUserManagementRoutes(deps()).request(
      `/api/me/user-management/invitations/${INVITATION_ID}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

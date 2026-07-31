import { describe, expect, test } from "bun:test";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import type { AdminEventType, EventTypeFolderRecord } from "../../src/db/admin-repo";

const U1 = "11111111-1111-4111-8111-111111111111";
const WS = "77777777-7777-4777-8777-777777777777";
const ET_ID = "66666666-6666-4666-8666-666666666666";
const FOLDER_ID = "88888888-8888-4888-8888-888888888888";
const FOREIGN_FOLDER = "99999999-9999-4999-8999-999999999999";

const folder: EventTypeFolderRecord = { id: FOLDER_ID, name: "Franchise", position: 0 };

const eventType: AdminEventType = {
  id: ET_ID,
  ownerUserId: U1,
  teamId: null,
  folderId: null,
  slug: "intro-call",
  title: "Intro call",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  hosts: [],
};

function makeDeps(overrides: Partial<AdminDeps> = {}): AdminDeps {
  return {
    requireAuth: async (c, next) => {
      c.set("user", { id: U1, email: "host@example.test", name: "Host", workspaceId: WS });
      await next();
    },
    listUsers: async () => [],
    listSchedulesForUser: async () => [],
    createSchedule: async () => { throw new Error("unused"); },
    updateSchedule: async () => null,
    deleteSchedule: async () => "not_found",
    listTeamsForUser: async () => [],
    createTeam: async () => "slug_taken",
    isTeamMember: async () => false,
    isTeamAdmin: async () => false,
    isAppAdmin: async () => false,
    listTeamMembers: async () => [],
    addTeamMember: async () => undefined,
    removeTeamMember: async () => "not_found",
    updateTeamMemberAdmin: async () => "not_found",
    listEventTypesForUser: async () => [eventType],
    getEventTypeForAdmin: async (id) => (id === ET_ID ? eventType : null),
    createEventType: async () => "slug_taken",
    updateEventType: async () => null,
    deleteEventType: async () => "not_found",
    listEventTypeFolders: async () => [folder],
    createEventTypeFolder: async (_ws, name) =>
      name.toLowerCase() === "franchise" ? "name_taken" : { id: FOLDER_ID, name, position: 1 },
    updateEventTypeFolder: async (id, _ws, patch) =>
      id === FOLDER_ID ? { ...folder, ...patch } : null,
    deleteEventTypeFolder: async (id) => (id === FOLDER_ID ? "deleted" : "not_found"),
    setEventTypeFolder: async (id, _userId, folderId) => {
      if (id !== ET_ID) return null;
      if (folderId === FOREIGN_FOLDER) return "folder_not_found";
      return { ...eventType, folderId };
    },
    ...overrides,
  };
}

describe("event type folders", () => {
  test("lists folders in position order", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders: [folder] });
  });

  test("creates a folder", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Support" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: FOLDER_ID, name: "Support", position: 1 });
  });

  test("rejects a case-insensitive duplicate name", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "franchise" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "folder_name_taken" });
  });

  test("rejects a blank name", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-type-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_body");
  });

  test("renames a folder and 404s an unknown one", async () => {
    const router = createAdminRoutes(makeDeps());
    const ok = await router.request(`/api/me/event-type-folders/${FOLDER_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Franchising" }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { name: string }).name).toBe("Franchising");

    const missing = await router.request(`/api/me/event-type-folders/${FOREIGN_FOLDER}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "folder_not_found" });
  });

  test("rejects an empty patch body", async () => {
    const res = await createAdminRoutes(makeDeps()).request(`/api/me/event-type-folders/${FOLDER_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_body");
  });

  test("deletes a folder", async () => {
    const res = await createAdminRoutes(makeDeps())
      .request(`/api/me/event-type-folders/${FOLDER_ID}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("moves an event type into a folder and back to ungrouped", async () => {
    const router = createAdminRoutes(makeDeps());
    const into = await router.request(`/api/me/event-types/${ET_ID}/folder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: FOLDER_ID }),
    });
    expect(into.status).toBe(200);
    expect(((await into.json()) as { folderId: string | null }).folderId).toBe(FOLDER_ID);

    const out = await router.request(`/api/me/event-types/${ET_ID}/folder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: null }),
    });
    expect(out.status).toBe(200);
    expect(((await out.json()) as { folderId: string | null }).folderId).toBeNull();
  });

  test("refuses a folder from another workspace", async () => {
    const res = await createAdminRoutes(makeDeps())
      .request(`/api/me/event-types/${ET_ID}/folder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: FOREIGN_FOLDER }),
      });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
  });

  test("returns an empty list when the session has no workspace", async () => {
    const deps = makeDeps({
      requireAuth: async (c, next) => {
        c.set("user", { id: U1, email: "host@example.test", name: "Host" });
        await next();
      },
    });
    const res = await createAdminRoutes(deps).request("/api/me/event-type-folders");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folders: [] });
  });

  // Security guard: setEventTypeFolder only scopes the folder-ownership
  // check to a workspace when one is passed. If a session with no
  // workspaceId reached that repo call with `undefined`, the ownership
  // check would silently go unscoped, letting a caller attach a folder
  // from another workspace. The route must 404 before ever calling
  // deps.setEventTypeFolder in that case.
  test("PATCHing a folder with no session workspace is refused", async () => {
    const deps = makeDeps({
      requireAuth: async (c, next) => {
        c.set("user", { id: U1, email: "host@example.test", name: "Host" });
        await next();
      },
      setEventTypeFolder: async () => {
        throw new Error("must not be called without a workspace");
      },
    });
    const res = await createAdminRoutes(deps).request(`/api/me/event-types/${ET_ID}/folder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: FOLDER_ID }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "workspace_not_found" });
  });

  test("creating an event type in another workspace's folder is refused", async () => {
    const res = await createAdminRoutes(makeDeps()).request("/api/me/event-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "intro-call",
        title: "Intro call",
        durationMinutes: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 10,
        minimumNoticeMin: 240,
        rollingWindowDays: 14,
        mode: "solo",
        scheduleId: null,
        teamId: null,
        folderId: FOREIGN_FOLDER,
        hosts: [{ userId: U1, role: "member", weight: 100 }],
      }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
  });
});

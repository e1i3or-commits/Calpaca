import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { getAuth } from "./index";
import { authenticateApiToken } from "../db/profile-repo";
import { ensureWorkspaceForUser } from "../db/workspace-repo";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  workspaceId?: string;
  workspaceRole?: "owner" | "admin" | "member";
};

export type AuthEnv = {
  Variables: { user: SessionUser };
};

export const requireSession: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const authorization = c.req.header("authorization");
  if (authorization?.startsWith("Bearer calpaca_")) {
    const user = await authenticateApiToken(authorization.slice(7));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const workspace = await ensureWorkspaceForUser(user.id);
    c.set("user", {
      ...user,
      workspaceId: workspace.workspaceId,
      workspaceRole: workspace.role,
    });
    await next();
    return;
  }
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const [account] = await getDb()
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!account || account.status !== "active") {
    return c.json({ error: "account_inactive" }, 403);
  }
  const workspace = await ensureWorkspaceForUser(session.user.id);
  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    workspaceId: workspace.workspaceId,
    workspaceRole: workspace.role,
  });
  await next();
};

import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { getAuth } from "./index";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthEnv = {
  Variables: { user: SessionUser };
};

export const requireSession: MiddlewareHandler<AuthEnv> = async (c, next) => {
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
  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  await next();
};

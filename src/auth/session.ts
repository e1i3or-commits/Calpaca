import type { MiddlewareHandler } from "hono";
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
  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  await next();
};

import type { Context } from "hono";
import { resolvePublicWorkspace } from "../db/workspace-repo";

export function requestHostname(c: Context): string {
  const forwarded = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded ?? c.req.header("host") ?? new URL(c.req.url).host;
}

export async function publicWorkspaceId(c: Context, workspaceSlug?: string) {
  const workspace = await resolvePublicWorkspace({
    hostname: requestHostname(c),
    workspaceSlug,
  });
  return workspace?.id;
}

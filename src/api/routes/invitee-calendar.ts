import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import {
  completeInviteeCalendarSession,
  createInviteeCalendarSession,
  deleteInviteeCalendarSession,
  getInviteeCalendarSession,
  getPendingInviteeCalendarSession,
} from "../../db/invitee-calendar-repo";
import { queryFreeBusy } from "../../sync/google";
import { getPublicWorkspaceEntitlements, resolvePublicWorkspace } from "../../db/workspace-repo";

const STATE_TTL_MS = 10 * 60_000;
const OVERLAY_TTL_MS = 60 * 60_000;
const WINDOW_DAYS = 93;
const SCOPE = "https://www.googleapis.com/auth/calendar.events.freebusy";
const token = () => randomBytes(32).toString("base64url");

function callbackUrl() {
  return process.env.INVITEE_CALENDAR_CALLBACK_URL
    ?? `${process.env.BETTER_AUTH_URL ?? process.env.PUBLIC_URL ?? "http://localhost:3000"}/api/invitee-calendar/callback`;
}

function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? request.headers.get("host") ?? new URL(request.url).host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto ?? new URL(request.url).protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function safeReturnUrl(request: Request, returnPath: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(returnPath, requestOrigin(request));
  } catch {
    return null;
  }
  if (parsed.origin !== requestOrigin(request) || !parsed.pathname.startsWith("/book/")) return null;
  parsed.hash = "";
  return parsed.toString();
}

async function exchangeCode(code: string, credentials: { clientId: string; clientSecret: string }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(),
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token ?? null;
}

function fragmentRedirect(returnUrl: string, key: string, value: string) {
  const url = new URL(returnUrl);
  url.hash = `${key}=${encodeURIComponent(value)}`;
  return url.toString();
}

export function createInviteeCalendarRoutes(): Hono {
  const router = new Hono();

  router.post("/invitee-calendar/connect", async (c) => {
    const credentials = googleCredentials();
    if (!credentials) return c.json({ error: "calendar_connection_unavailable" }, 503);
    const parsed = z.object({
      returnPath: z.string().min(1),
      workspaceSlug: z.string().min(1).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const returnUrl = safeReturnUrl(c.req.raw, parsed.data.returnPath);
    if (!returnUrl) return c.json({ error: "invalid_return_path" }, 400);
    const workspace = await resolvePublicWorkspace({
      hostname: new URL(returnUrl).hostname,
      workspaceSlug: parsed.data.workspaceSlug,
    });
    const entitlements = workspace
      ? await getPublicWorkspaceEntitlements(workspace.id)
      : null;
    if (!entitlements?.inviteeCalendarOverlay) {
      return c.json({ error: "feature_not_available" }, 403);
    }

    const state = token();
    await createInviteeCalendarSession({
      state,
      returnUrl,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.search = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: SCOPE,
      state,
      access_type: "online",
      include_granted_scopes: "false",
      prompt: "select_account",
    }).toString();
    return c.json({ authorizationUrl: authorize.toString() });
  });

  router.get("/api/invitee-calendar/callback", async (c) => {
    const state = c.req.query("state");
    const code = c.req.query("code");
    const pending = state ? await getPendingInviteeCalendarSession(state) : null;
    if (!pending) return c.text("This calendar connection has expired.", 400);
    if (!code || c.req.query("error")) {
      return c.redirect(fragmentRedirect(pending.returnUrl, "calendarError", "connection_cancelled"));
    }
    const credentials = googleCredentials();
    if (!credentials) return c.text("Calendar connection is unavailable.", 503);
    const accessToken = await exchangeCode(code, credentials);
    if (!accessToken) {
      return c.redirect(fragmentRedirect(pending.returnUrl, "calendarError", "connection_failed"));
    }
    const now = new Date();
    const end = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
    const busyResult = await queryFreeBusy({
      accessToken,
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
    });
    if (!busyResult.ok) {
      return c.redirect(fragmentRedirect(pending.returnUrl, "calendarError", "calendar_unavailable"));
    }
    const capability = token();
    const expiresAt = new Date(Date.now() + OVERLAY_TTL_MS);
    const completed = await completeInviteeCalendarSession({
      id: pending.id,
      capability,
      busy: busyResult.value,
      expiresAt,
    });
    if (!completed) return c.text("This calendar connection has expired.", 400);
    return c.redirect(fragmentRedirect(pending.returnUrl, "calendarSession", capability));
  });

  router.get("/invitee-calendar/status", async (c) => {
    const capability = c.req.header("x-calpaca-invitee-calendar");
    const session = capability ? await getInviteeCalendarSession(capability) : null;
    if (!session) return c.json({ connected: false });
    return c.json({ connected: true, expiresAt: session.expiresAt.toISOString() });
  });

  router.delete("/invitee-calendar/session", async (c) => {
    const capability = c.req.header("x-calpaca-invitee-calendar");
    if (capability) await deleteInviteeCalendarSession(capability);
    return c.json({ connected: false });
  });

  return router;
}

export const inviteeCalendarRoutes = createInviteeCalendarRoutes();

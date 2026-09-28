import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { getAuth } from "../../auth/index";
import { requireSession, type AuthEnv } from "../../auth/session";
import { listEndedFollowups } from "../../db/onboarding-meetings-repo";
import { getWritableConnectionForUser } from "../../db/sync-repo";
import { findGeminiNotes, MeetingNotesLookupError } from "../../sync/meeting-notes-google";

export interface OnboardingMeetingsDeps {
  requireAuth: MiddlewareHandler<AuthEnv>;
  list: typeof listEndedFollowups;
  accessToken: (userId: string) => Promise<string | null>;
  notes: typeof findGeminiNotes;
  now: () => Date;
}
const defaults: OnboardingMeetingsDeps = {
  requireAuth: requireSession, list: listEndedFollowups, notes: findGeminiNotes, now: () => new Date(),
  accessToken: async (userId) => {
    if (!await getWritableConnectionForUser(userId)) return null;
    const token = await getAuth().api.getAccessToken({ body: { providerId: "google", userId } }).catch(() => null);
    return token?.accessToken ?? null;
  },
};

/** Ended onboarding follow-ups and their Gemini notes, for the meeting-notes
 * worker. Notes are looked for once the meeting has been over for a while,
 * because Google attaches them some minutes after the call ends. */
export function createOnboardingMeetingRoutes(deps: OnboardingMeetingsDeps = defaults) {
  const router = new Hono<AuthEnv>();
  router.use("/api/automation/onboarding-meetings/*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); }, deps.requireAuth);
  router.get("/api/automation/onboarding-meetings/ended", async (c) => {
    const user = c.get("user"); if (!user.workspaceId || !user.workspaceRole) return c.json({ error: "workspace_not_found" }, 404);
    if (!["admin", "owner"].includes(user.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    const since = z.string().datetime({ offset: true }).safeParse(c.req.query("since"));
    if (!since.success) return c.json({ error: "invalid_input" }, 400);
    const now = deps.now(), from = new Date(since.data);
    if (now.getTime() - from.getTime() > 14 * 86400_000) return c.json({ error: "window_too_large" }, 400);
    // Settled: over for at least 20 minutes, so Gemini has had time to attach the notes.
    const meetings = await deps.list(user.workspaceId, from, new Date(now.getTime() - 20 * 60_000));
    const tokens = new Map<string, string | null>();
    const results = [];
    for (const m of meetings) {
      if (!tokens.has(m.calendar.organizerUserId)) tokens.set(m.calendar.organizerUserId, await deps.accessToken(m.calendar.organizerUserId));
      const token = tokens.get(m.calendar.organizerUserId);
      const base = { bookingId: m.bookingId, sourceKey: `calpaca:booking:${m.bookingId}`, sourceProjectKey: m.sourceProjectKey, sourceWorkspaceId: m.sourceWorkspaceId, startsAt: m.startsAt, endsAt: m.endsAt };
      if (!token) { results.push({ ...base, notes: null, issue: "organizer_calendar_unavailable" }); continue; }
      try { results.push({ ...base, notes: await deps.notes(m.calendar.calendarId, m.calendar.eventId, token), issue: null }); }
      catch (error) { results.push({ ...base, notes: null, issue: error instanceof MeetingNotesLookupError ? error.code : "notes_lookup_failed" }); }
    }
    return c.json({ checkedAt: now.toISOString(), meetings: results });
  });
  return router;
}
export const onboardingMeetingRoutes = createOnboardingMeetingRoutes();

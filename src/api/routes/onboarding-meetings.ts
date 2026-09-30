import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { getAuth } from "../../auth/index";
import { requireSession, type AuthEnv } from "../../auth/session";
import { listEndedFollowupsPage } from "../../db/onboarding-meetings-repo";
import { getWritableConnectionForUser } from "../../db/sync-repo";
import { findGeminiNotes, MeetingNotesLookupError } from "../../sync/meeting-notes-google";

import { claimMeetingNotes, readClaimedMeeting, finishMeetingNotes, meetingNotesHealth } from "../../db/meeting-notes-queue";
const queueDefaults={claim:claimMeetingNotes,read:readClaimedMeeting,finish:finishMeetingNotes,health:meetingNotesHealth};
export interface OnboardingMeetingsDeps {
  queue?: typeof queueDefaults;
  requireAuth: MiddlewareHandler<AuthEnv>;
  list: typeof listEndedFollowupsPage;
  accessToken: (userId: string) => Promise<string | null>;
  notes: typeof findGeminiNotes;
  now: () => Date;
}
const defaults: OnboardingMeetingsDeps = {
  requireAuth: requireSession, list: listEndedFollowupsPage, notes: findGeminiNotes, now: () => new Date(),
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
  const queue=deps.queue??queueDefaults;
  router.use("/api/automation/onboarding-meetings/*",async(c,next)=>{
    const user=c.get("user");
    if(!user.workspaceId||!user.workspaceRole)return c.json({error:"workspace_not_found"},404);
    if(!["admin","owner"].includes(user.workspaceRole))return c.json({error:"forbidden"},403);
    await next();
  });
  router.post("/api/automation/onboarding-meetings/claim",async c=>{
    const input=z.object({since:z.string().datetime({offset:true})}).strict().safeParse(await c.req.json().catch(()=>null));
    const now=deps.now();
    if(!input.success||new Date(input.data.since)>=now)return c.json({error:"invalid_input"},400);
    const ws=c.get("user").workspaceId!;
    let job;
    try {job=await queue.claim(ws,new Date(input.data.since),now);}
    catch(error){if(error instanceof Error&&error.message==="meeting_notes_start_conflict")return c.json({error:"start_conflict"},409);throw error;}
    if(!job)return c.json({checkedAt:now.toISOString(),job:null,meetings:[]});
    const m=await queue.read(ws,job.bookingId);
    if(!m){await queue.finish(ws,job.bookingId,job.leaseToken,"complete",now);return c.json({checkedAt:now.toISOString(),job:null,meetings:[]});}
    if(new Date(m.endsAt).getTime()>now.getTime()-20*60_000){await queue.finish(ws,job.bookingId,job.leaseToken,"defer",now);return c.json({checkedAt:now.toISOString(),job:null,meetings:[]});}
    const base={bookingId:m.bookingId,sourceKey:`calpaca:booking:${m.bookingId}`,sourceProjectKey:m.sourceProjectKey,sourceWorkspaceId:m.sourceWorkspaceId,startsAt:m.startsAt,endsAt:m.endsAt};
    let notes=null,issue:string|null=null;
    if(!m.calendar)issue="calendar_delivery_pending";
    else {
      const token=await deps.accessToken(m.calendar.organizerUserId).catch(()=>null);
      if(!token)issue="organizer_calendar_unavailable";
      else try{notes=await deps.notes(m.calendar.calendarId,m.calendar.eventId,token);}
      catch(error){issue=error instanceof MeetingNotesLookupError?error.code:"notes_lookup_failed";}
    }
    return c.json({checkedAt:now.toISOString(),job,meetings:[{...base,notes,issue}]});
  });
  router.post("/api/automation/onboarding-meetings/finish",async c=>{
    const input=z.object({bookingId:z.string().uuid(),leaseToken:z.string().uuid(),outcome:z.enum(["defer","no_notes","pending","complete","failed"])}).strict().safeParse(await c.req.json().catch(()=>null));
    if(!input.success)return c.json({error:"invalid_input"},400);
    const b=input.data;
    const ok=await queue.finish(c.get("user").workspaceId!,b.bookingId,b.leaseToken,b.outcome,deps.now());
    return ok?c.json({accepted:true}):c.json({error:"lease_conflict"},409);
  });
  router.get("/api/automation/onboarding-meetings/health",async c=>{const now=deps.now(),workspaceId=c.get("user").workspaceId!;return c.json({workspaceId,checkedAt:now.toISOString(),...await queue.health(workspaceId,now)});});
  router.get("/api/automation/onboarding-meetings/ended", async (c) => {
    const user = c.get("user"); if (!user.workspaceId || !user.workspaceRole) return c.json({ error: "workspace_not_found" }, 404);
    if (!["admin", "owner"].includes(user.workspaceRole)) return c.json({ error: "forbidden" }, 403);
    const query = z.object({
      since: z.string().datetime({ offset: true }),
      until: z.string().datetime({ offset: true }).optional(),
      afterEndsAt: z.string().datetime({ offset: true }).optional(),
      afterBookingId: z.string().uuid().optional(),
    }).safeParse(c.req.query());
    if (!query.success) return c.json({ error: "invalid_input" }, 400);
    const q = query.data, now = deps.now(), from = new Date(q.since);
    // Freeze until across pages; explicit bounded windows also permit recovery
    // after outages older than 14 days, without one unbounded provider request.
    const settled = new Date(now.getTime() - 20 * 60_000);
    const until = q.until ? new Date(q.until) : settled;
    if (until <= from || until > settled) return c.json({ error: "invalid_window" }, 400);
    if (until.getTime() - from.getTime() > 14 * 86400_000) return c.json({ error: "window_too_large" }, 400);
    const hasCursor = q.afterEndsAt !== undefined || q.afterBookingId !== undefined;
    if (hasCursor && (!q.until || !q.afterEndsAt || !q.afterBookingId)) return c.json({ error: "invalid_cursor" }, 400);
    const cursor = q.afterEndsAt && q.afterBookingId ? { endsAt: q.afterEndsAt, bookingId: q.afterBookingId } : null;
    if (cursor && (new Date(cursor.endsAt) <= from || new Date(cursor.endsAt) > until)) return c.json({ error: "invalid_cursor" }, 400);
    const page = await deps.list(user.workspaceId, from, until, cursor);
    const tokens = new Map<string, string | null>();
    const results = [];
    for (const m of page.meetings) {
      if (!tokens.has(m.calendar.organizerUserId)) tokens.set(m.calendar.organizerUserId, await deps.accessToken(m.calendar.organizerUserId).catch(() => null));
      const token = tokens.get(m.calendar.organizerUserId);
      const base = { bookingId: m.bookingId, sourceKey: `calpaca:booking:${m.bookingId}`, sourceProjectKey: m.sourceProjectKey, sourceWorkspaceId: m.sourceWorkspaceId, startsAt: m.startsAt, endsAt: m.endsAt };
      if (!token) { results.push({ ...base, notes: null, issue: "organizer_calendar_unavailable" }); continue; }
      try { results.push({ ...base, notes: await deps.notes(m.calendar.calendarId, m.calendar.eventId, token), issue: null }); }
      catch (error) { results.push({ ...base, notes: null, issue: error instanceof MeetingNotesLookupError ? error.code : "notes_lookup_failed" }); }
    }
    return c.json({ checkedAt: now.toISOString(), until: until.toISOString(), meetings: results, nextCursor: page.nextCursor });
  });
  return router;
}
export const onboardingMeetingRoutes = createOnboardingMeetingRoutes();

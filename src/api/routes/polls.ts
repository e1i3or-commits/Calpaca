import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import { getPublicWorkspaceEntitlements } from "../../db/workspace-repo";
import {
  createMeetingPoll,
  finalizeMeetingPoll,
  getMeetingPollForOwner,
  getMeetingPollResponse,
  getPublicMeetingPoll,
  listMeetingPolls,
  saveMeetingPollVotes,
  type PollRecord,
} from "../../db/poll-repo";
import { isIanaZone } from "../../lib/timezone";
import { createRateLimitMiddleware } from "../rate-limit";
import { bucketStart, decide } from "../../core/ratelimit/window";
import { incrementRateLimit } from "../../db/rate-limit-repo";

const optionSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().refine(isIanaZone),
  options: z.array(optionSchema).min(2).max(20),
});
const voteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
  editToken: z.string().min(20).optional(),
  votes: z.array(z.object({
    optionId: z.string().uuid(),
    choice: z.enum(["yes", "if_needed", "no"]),
  })).min(1).max(20),
});
const finalizeSchema = z.object({ optionId: z.string().uuid() });

function renderPoll(poll: PollRecord) {
  return {
    id: poll.id,
    publicId: poll.publicId,
    title: poll.title,
    description: poll.description,
    timezone: poll.timezone,
    status: poll.status,
    finalizedOptionId: poll.finalizedOptionId,
    participantCount: poll.participantCount,
    options: poll.options.map((option, rank) => ({
      id: option.id,
      start: option.startsAt.toISOString(),
      end: option.endsAt.toISOString(),
      yes: option.yes,
      ifNeeded: option.ifNeeded,
      no: option.no,
      rank: rank + 1,
    })),
    ...(poll.responses ? { responses: poll.responses } : {}),
  };
}

function parseOptions(options: z.infer<typeof optionSchema>[]) {
  const now = Temporal.Now.instant();
  return options.map((option) => {
    const start = Temporal.Instant.from(option.start);
    const end = Temporal.Instant.from(option.end);
    if (
      Temporal.Instant.compare(start, now) <= 0
      || Temporal.Instant.compare(start, end) >= 0
    ) throw new RangeError("invalid option");
    return { startsAt: new Date(start.epochMilliseconds), endsAt: new Date(end.epochMilliseconds) };
  });
}

export function createPollRoutes(): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.use("/api/me/polls", requireSession);
  routes.use("/api/me/polls/*", requireSession);
  routes.use("/polls/:publicId/votes", createRateLimitMiddleware({
    now: () => Temporal.Now.instant(),
    checkRateLimit: async (key, now, limit, windowSeconds) => {
      const bucket = bucketStart(now, windowSeconds);
      const count = await incrementRateLimit(key, bucket);
      return decide(
        count,
        limit,
        now.until(bucket.add({ seconds: windowSeconds })).total({ unit: "seconds" }),
      );
    },
  }, {
    scope: "poll-votes",
    envName: "RATE_LIMIT_POLL_VOTES_PER_MINUTE",
    defaultLimit: 10,
  }));

  routes.get("/api/me/polls", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    return c.json({ polls: (await listMeetingPolls(workspaceId)).map(renderPoll) });
  });

  routes.post("/api/me/polls", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const user = c.get("user");
    if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
    const entitlements = await getPublicWorkspaceEntitlements(user.workspaceId);
    if (!entitlements?.meetingPolls) return c.json({ error: "feature_not_available" }, 403);
    let options;
    try {
      options = parseOptions(parsed.data.options);
    } catch {
      return c.json({ error: "invalid_options" }, 400);
    }
    const poll = await createMeetingPoll({
      workspaceId: user.workspaceId,
      ownerUserId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      timezone: parsed.data.timezone,
      options,
    });
    return c.json(renderPoll(poll), 201);
  });

  routes.get("/api/me/polls/:id", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "poll_not_found" }, 404);
    const poll = await getMeetingPollForOwner(c.req.param("id"), workspaceId);
    return poll ? c.json(renderPoll(poll)) : c.json({ error: "poll_not_found" }, 404);
  });

  routes.post("/api/me/polls/:id/finalize", async (c) => {
    const parsed = finalizeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "poll_not_found" }, 404);
    const result = await finalizeMeetingPoll(c.req.param("id"), workspaceId, parsed.data.optionId);
    if (result === "not_found") return c.json({ error: "poll_not_found" }, 404);
    if (result === "closed") return c.json({ error: "poll_closed" }, 409);
    if (result === "invalid_option") return c.json({ error: "invalid_option" }, 400);
    return c.json(renderPoll(result));
  });

  routes.get("/polls/:publicId", async (c) => {
    const poll = await getPublicMeetingPoll(c.req.param("publicId"));
    return poll ? c.json(renderPoll(poll)) : c.json({ error: "poll_not_found" }, 404);
  });

  routes.get("/polls/:publicId/response", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.json({ error: "invalid_token" }, 400);
    const response = await getMeetingPollResponse(c.req.param("publicId"), token);
    return response ? c.json(response) : c.json({ error: "invalid_token" }, 403);
  });

  routes.post("/polls/:publicId/votes", async (c) => {
    const parsed = voteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    const result = await saveMeetingPollVotes({
      publicId: c.req.param("publicId"),
      name: parsed.data.name,
      email: parsed.data.email,
      votes: parsed.data.votes,
      token: parsed.data.editToken,
    });
    if (result === "not_found") return c.json({ error: "poll_not_found" }, 404);
    if (result === "closed") return c.json({ error: "poll_closed" }, 409);
    if (result === "email_exists") return c.json({ error: "response_exists" }, 409);
    if (result === "invalid_token") return c.json({ error: "invalid_token" }, 403);
    if (result === "invalid_options") return c.json({ error: "invalid_options" }, 400);
    return c.json(result, 201);
  });

  return routes;
}

export const pollRoutes = createPollRoutes();

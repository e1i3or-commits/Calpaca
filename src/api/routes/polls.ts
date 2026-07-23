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
  getMeetingPollWorkspaceId,
  getPublicMeetingPoll,
  listMeetingPolls,
  saveMeetingPollVotes,
  resetPollFinalizationDelivery,
  setMeetingPollOpenState,
  type PollRecord,
} from "../../db/poll-repo";
import { getInviteeCalendarSession } from "../../db/invitee-calendar-repo";
import { isIanaZone } from "../../lib/timezone";
import { createRateLimitMiddleware } from "../rate-limit";
import { bucketStart, decide } from "../../core/ratelimit/window";
import { incrementRateLimit } from "../../db/rate-limit-repo";
import {
  getBusyForUsers,
  getSchedulesForUsers,
  type HostBusy,
  type HostSchedule,
} from "../../db/availability-repo";
import { effectiveOpenIntervals } from "../../core/availability/overrides";
import { intersectMany, subtract, type Interval } from "../../core/availability/intervals";
import { generateSlots } from "../../core/availability/slots";
import { scoreSlots } from "../../core/availability/scoring";
import {
  emitPollFinalizedWebhook,
  enqueuePollFinalizationEmail,
} from "../../jobs/index";

const optionSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().refine(isIanaZone),
  resultsVisibility: z.enum(["live", "after_response", "aggregates", "hidden"]).default("after_response"),
  deadline: z.string().datetime().optional(),
  allowResponseEditing: z.boolean().default(true),
  participantLimit: z.number().int().min(1).max(500).optional(),
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
const suggestionSchema = z.object({
  timezone: z.string().refine(isIanaZone),
  startDate: z.string().date(),
  endDate: z.string().date(),
  dailyStart: z.string().regex(/^\d{2}:\d{2}$/),
  dailyEnd: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(15).max(480),
  count: z.number().int().min(2).max(20),
});

export interface PollSuggestionDeps {
  readonly getSchedulesForUsers: (userIds: readonly string[]) => Promise<HostSchedule[]>;
  readonly getBusyForUsers: (userIds: readonly string[], window: Interval) => Promise<HostBusy[]>;
  readonly now: () => Temporal.Instant;
  readonly enqueueFinalizationEmail?: (pollId: string, participantId?: string) => Promise<void>;
  readonly emitFinalizedWebhook?: (pollId: string) => Promise<void>;
}

const defaultSuggestionDeps: PollSuggestionDeps = {
  getSchedulesForUsers,
  getBusyForUsers,
  now: () => Temporal.Now.instant(),
  enqueueFinalizationEmail: enqueuePollFinalizationEmail,
  emitFinalizedWebhook: emitPollFinalizedWebhook,
};

function renderPoll(
  poll: PollRecord,
  publicView = false,
  revealParticipantResults = true,
) {
  const deadlinePassed = poll.deadline !== null && poll.deadline.getTime() <= Date.now();
  const participantLimitReached = poll.participantLimit !== null
    && poll.participantCount >= poll.participantLimit;
  const votingOpen = poll.status === "open"
    && !deadlinePassed
    && (!publicView || !participantLimitReached || revealParticipantResults);
  const showAggregates = !publicView
    || poll.status === "finalized"
    || poll.resultsVisibility === "live"
    || poll.resultsVisibility === "aggregates"
    || (poll.resultsVisibility === "after_response" && revealParticipantResults);
  const showResponses = !publicView
    || poll.status === "finalized"
    || poll.resultsVisibility === "live"
    || (poll.resultsVisibility === "after_response" && revealParticipantResults);
  const renderedOptions = showAggregates
    ? poll.options
    : [...poll.options].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return {
    id: poll.id,
    publicId: poll.publicId,
    title: poll.title,
    description: poll.description,
    timezone: poll.timezone,
    status: votingOpen ? poll.status : (poll.status === "open" ? "closed" : poll.status),
    votingOpen,
    resultsVisibility: poll.resultsVisibility,
    resultsRevealed: showAggregates,
    deadline: poll.deadline?.toISOString() ?? null,
    allowResponseEditing: poll.allowResponseEditing,
    participantLimit: poll.participantLimit,
    participantLimitReached,
    finalizedOptionId: poll.finalizedOptionId,
    participantCount: poll.participantCount,
    options: renderedOptions.map((option, rank) => ({
      id: option.id,
      start: option.startsAt.toISOString(),
      end: option.endsAt.toISOString(),
      yes: showAggregates ? option.yes : 0,
      ifNeeded: showAggregates ? option.ifNeeded : 0,
      no: showAggregates ? option.no : 0,
      rank: rank + 1,
    })),
    ...(poll.responses && showResponses
      ? {
          responses: poll.responses.map((response) => ({
            name: response.name,
            ...(!publicView ? { email: response.email } : {}),
            ...(!publicView
              ? {
                  id: response.id,
                  finalizationStatus: response.finalizationStatus,
                  finalizationSentAt: response.finalizationSentAt?.toISOString() ?? null,
                  finalizationError: response.finalizationError,
                }
              : {}),
            votes: response.votes,
          })),
        }
      : {}),
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
      || start.epochMilliseconds % (15 * 60_000) !== 0
    ) throw new RangeError("invalid option");
    return { startsAt: new Date(start.epochMilliseconds), endsAt: new Date(end.epochMilliseconds) };
  });
}

function suggestionWindow(
  input: z.infer<typeof suggestionSchema>,
): { window: Interval; dailyWindows: Interval[] } {
  const startDate = Temporal.PlainDate.from(input.startDate);
  const endDate = Temporal.PlainDate.from(input.endDate);
  if (Temporal.PlainDate.compare(startDate, endDate) > 0) throw new RangeError("invalid date range");
  if (startDate.until(endDate, { largestUnit: "day" }).days > 30) {
    throw new RangeError("date range too large");
  }
  const dailyStart = Temporal.PlainTime.from(input.dailyStart);
  const dailyEnd = Temporal.PlainTime.from(input.dailyEnd);
  if (Temporal.PlainTime.compare(dailyStart, dailyEnd) >= 0) throw new RangeError("invalid daily window");

  const dailyWindows: Interval[] = [];
  for (
    let date = startDate;
    Temporal.PlainDate.compare(date, endDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    dailyWindows.push({
      start: date.toPlainDateTime(dailyStart)
        .toZonedDateTime(input.timezone, { disambiguation: "compatible" }).toInstant(),
      end: date.toPlainDateTime(dailyEnd)
        .toZonedDateTime(input.timezone, { disambiguation: "compatible" }).toInstant(),
    });
  }
  return {
    window: {
      start: dailyWindows[0]!.start,
      end: dailyWindows[dailyWindows.length - 1]!.end,
    },
    dailyWindows,
  };
}

export function createPollRoutes(
  suggestionDeps: PollSuggestionDeps = defaultSuggestionDeps,
): Hono<AuthEnv> {
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
    return c.json({ polls: (await listMeetingPolls(workspaceId)).map((poll) => renderPoll(poll)) });
  });

  routes.post("/api/me/polls/suggestions", async (c) => {
    const parsed = suggestionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

    let requested;
    try {
      requested = suggestionWindow(parsed.data);
    } catch {
      return c.json({ error: "invalid_window" }, 400);
    }
    const userId = c.get("user").id;
    const [schedule] = await suggestionDeps.getSchedulesForUsers([userId]);
    if (!schedule) return c.json({ suggestions: [] });
    const [busy] = await suggestionDeps.getBusyForUsers([userId], requested.window);
    const open = intersectMany([
      subtract(
        effectiveOpenIntervals(
          schedule.rules,
          schedule.overrides ?? [],
          schedule.timezone,
          requested.window,
        ),
        busy?.intervals ?? [],
      ),
      requested.dailyWindows,
    ]);
    const candidates = generateSlots(open, {
      durationMinutes: parsed.data.durationMinutes,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      minimumNoticeMin: 0,
      rollingWindowDays: 366,
      slotIncrementMin: 15,
      timezone: parsed.data.timezone,
    }, suggestionDeps.now());
    const ranked = scoreSlots(candidates, {
      busy: busy?.intervals ?? [],
      open,
      prefs: {},
      timezone: schedule.timezone,
    }).slice(0, parsed.data.count);

    return c.json({
      suggestions: ranked.map(({ slot }) => ({
        start: slot.start.toString(),
        end: slot.end.toString(),
      })),
    });
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
    if (parsed.data.deadline && new Date(parsed.data.deadline).getTime() <= Date.now()) {
      return c.json({ error: "deadline_must_be_future" }, 400);
    }
    const poll = await createMeetingPoll({
      workspaceId: user.workspaceId,
      ownerUserId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      timezone: parsed.data.timezone,
      resultsVisibility: parsed.data.resultsVisibility,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      allowResponseEditing: parsed.data.allowResponseEditing,
      participantLimit: parsed.data.participantLimit,
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
    await Promise.all([
      suggestionDeps.enqueueFinalizationEmail?.(result.id),
      suggestionDeps.emitFinalizedWebhook?.(result.id),
    ]);
    return c.json(renderPoll(result));
  });

  routes.post("/api/me/polls/:id/participants/:participantId/resend", async (c) => {
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "poll_not_found" }, 404);
    const participantId = c.req.param("participantId");
    const reset = await resetPollFinalizationDelivery(
      c.req.param("id"),
      workspaceId,
      participantId,
    );
    if (!reset) return c.json({ error: "participant_not_found" }, 404);
    await suggestionDeps.enqueueFinalizationEmail?.(c.req.param("id"), participantId);
    return c.json({ status: "pending" });
  });

  routes.post("/api/me/polls/:id/state", async (c) => {
    const parsed = z.object({ open: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const workspaceId = c.get("user").workspaceId;
    if (!workspaceId) return c.json({ error: "poll_not_found" }, 404);
    const result = await setMeetingPollOpenState(
      c.req.param("id"),
      workspaceId,
      parsed.data.open,
    );
    if (result === "not_found") return c.json({ error: "poll_not_found" }, 404);
    if (result === "finalized") return c.json({ error: "poll_finalized" }, 409);
    if (result === "deadline_passed") return c.json({ error: "deadline_passed" }, 409);
    return c.json(renderPoll(result));
  });

  routes.get("/polls/:publicId", async (c) => {
    const poll = await getPublicMeetingPoll(c.req.param("publicId"));
    if (!poll) return c.json({ error: "poll_not_found" }, 404);
    const token = c.req.query("token");
    const hasResponse = token
      ? Boolean(await getMeetingPollResponse(poll.publicId, token))
      : false;
    return c.json(renderPoll(poll, true, hasResponse));
  });

  routes.get("/polls/:publicId/calendar-assessment", async (c) => {
    const capability = c.req.header("x-calpaca-invitee-calendar");
    const session = capability ? await getInviteeCalendarSession(capability) : null;
    if (!session) return c.json({ error: "calendar_session_not_found" }, 401);
    const publicId = c.req.param("publicId");
    const workspaceId = await getMeetingPollWorkspaceId(publicId);
    const entitlements = workspaceId
      ? await getPublicWorkspaceEntitlements(workspaceId)
      : null;
    if (!entitlements?.inviteeCalendarOverlay) {
      return c.json({ error: workspaceId ? "feature_not_available" : "poll_not_found" }, workspaceId ? 403 : 404);
    }
    const poll = await getPublicMeetingPoll(publicId);
    if (!poll) return c.json({ error: "poll_not_found" }, 404);
    const busy = session.busy.flatMap((interval) => {
      try {
        return [{
          start: Temporal.Instant.from(interval.start),
          end: Temporal.Instant.from(interval.end),
        }];
      } catch {
        return [];
      }
    });
    return c.json({
      assessment: poll.options.map((option) => {
        const start = Temporal.Instant.from(option.startsAt.toISOString());
        const end = Temporal.Instant.from(option.endsAt.toISOString());
        const conflicts = busy.some((interval) =>
          Temporal.Instant.compare(interval.start, end) < 0
          && Temporal.Instant.compare(start, interval.end) < 0
        );
        return { optionId: option.id, choice: conflicts ? "no" : "yes" };
      }),
      expiresAt: session.expiresAt.toISOString(),
    });
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
    if (result === "editing_disabled") return c.json({ error: "response_editing_disabled" }, 403);
    if (result === "participant_limit_reached") return c.json({ error: "participant_limit_reached" }, 409);
    if (result === "invalid_options") return c.json({ error: "invalid_options" }, 400);
    return c.json(result, 201);
  });

  return routes;
}

export const pollRoutes = createPollRoutes();

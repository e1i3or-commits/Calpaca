import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { bucketStart, decide, type RateLimitDecision } from "../../core/ratelimit/window";
import { incrementRateLimit } from "../../db/rate-limit-repo";
import {
  createTimeSuggestion,
  getSuggestionEventTypeBySlug,
  type SuggestionEventType,
  type TimeSuggestionInput,
} from "../../db/suggestion-repo";
import { emitSuggestionWebhook, enqueueSuggestionEmail } from "../../jobs/index";
import { createRateLimitMiddleware } from "../rate-limit";
import { publicWorkspaceId } from "../public-workspace";

export interface SuggestionDeps {
  getEventTypeBySlug: (slug: string, workspaceId?: string) => Promise<SuggestionEventType | null>;
  resolveWorkspaceId?: (
    context: Parameters<typeof publicWorkspaceId>[0],
    workspaceSlug?: string,
  ) => Promise<string | undefined>;
  createSuggestion: (eventTypeId: string, input: TimeSuggestionInput) => Promise<string>;
  enqueueEmail?: (suggestionId: string) => Promise<void>;
  emitWebhook?: (suggestionId: string) => Promise<void>;
  now: () => Temporal.Instant;
  checkRateLimit?: (
    key: string, now: Temporal.Instant, limit: number, windowSeconds: number
  ) => Promise<RateLimitDecision>;
}

const defaults: SuggestionDeps = {
  getEventTypeBySlug: (slug, workspaceId) =>
    getSuggestionEventTypeBySlug(slug, undefined, workspaceId),
  resolveWorkspaceId: publicWorkspaceId,
  createSuggestion: (eventTypeId, input) => createTimeSuggestion(eventTypeId, input),
  enqueueEmail: (id) => enqueueSuggestionEmail(id),
  emitWebhook: (id) => emitSuggestionWebhook(id),
  now: () => Temporal.Now.instant(),
  checkRateLimit: async (key, now, limit, windowSeconds) => {
    const bucket = bucketStart(now, windowSeconds);
    const count = await incrementRateLimit(key, bucket);
    return decide(count, limit, now.until(bucket.add({ seconds: windowSeconds })).total({ unit: "seconds" }));
  },
};

const bodySchema = z.object({
  workspaceSlug: z.string().min(1).optional(),
  invitee: z.object({
    email: z.string().email(),
    name: z.string().trim().min(1).max(200),
    timezone: z.string().min(1),
  }),
  proposedSlots: z.array(z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  })).min(1).max(3),
  message: z.string().max(1000).optional(),
});

export function createSuggestionRoutes(deps: SuggestionDeps = defaults): Hono {
  const routes = new Hono();
  routes.use(
    "/event-types/:slug/suggestions",
    createRateLimitMiddleware(deps, {
      scope: "suggestions",
      envName: "RATE_LIMIT_SUGGESTIONS_PER_MINUTE",
      defaultLimit: 5,
    }),
  );
  routes.post("/event-types/:slug/suggestions", async (c) => {
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const { invitee } = parsed.data;
    try {
      deps.now().toZonedDateTimeISO(invitee.timezone);
    } catch {
      return c.json({ error: "invalid_timezone" }, 400);
    }
    const now = deps.now();
    let slots: { start: string; end: string }[];
    try {
      slots = parsed.data.proposedSlots.map((slot) => {
        const start = Temporal.Instant.from(slot.start);
        const end = Temporal.Instant.from(slot.end);
        if (Temporal.Instant.compare(start, now) <= 0 || Temporal.Instant.compare(start, end) >= 0) {
          throw new RangeError("invalid slot");
        }
        return { start: start.toString(), end: end.toString() };
      });
    } catch {
      return c.json({ error: "invalid_slots" }, 400);
    }
    const workspaceId = deps.resolveWorkspaceId
      ? await deps.resolveWorkspaceId(c, parsed.data.workspaceSlug)
      : undefined;
    if (process.env.CALPACA_DEPLOYMENT_MODE === "hosted" && !workspaceId) {
      return c.json({ error: "not_found" }, 404);
    }
    const eventType = await deps.getEventTypeBySlug(c.req.param("slug"), workspaceId);
    if (!eventType) return c.json({ error: "not_found" }, 404);
    const message = parsed.data.message?.trim();
    const id = await deps.createSuggestion(eventType.id, {
      inviteeEmail: invitee.email,
      inviteeName: invitee.name,
      inviteeTimezone: invitee.timezone,
      proposedSlots: slots,
      ...(message && { message }),
    });
    await Promise.all([deps.enqueueEmail?.(id), deps.emitWebhook?.(id)]);
    return c.json({ suggestionId: id }, 201);
  });
  return routes;
}

export const suggestionRoutes = createSuggestionRoutes();

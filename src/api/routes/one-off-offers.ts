import { Hono } from "hono";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { requireSession, type AuthEnv } from "../../auth/session";
import {
  createOneOffOffer,
  getOneOffOfferByPublicId,
  listOneOffOffers,
  revokeOneOffOffer,
} from "../../db/one-off-offer-repo";
import { getEventTypeForAdmin, isAppAdmin } from "../../db/admin-repo";
import { isAllowedDuration } from "../../core/booking/durations";
import { getBusyForUsers, getSchedulesForUsers } from "../../db/availability-repo";
import { suggestOpenSlots, suggestionWindow } from "../../core/availability/suggest";
import { isIanaZone } from "../../lib/timezone";

const bodySchema = z.object({
  eventTypeId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().max(2000).nullable().default(null),
  recipientEmail: z.string().email().nullable().default(null),
  slots: z.array(z.object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })).min(1).max(20),
  expiresAt: z.string().datetime({ offset: true }),
});

const suggestionSchema = z.object({
  eventTypeId: z.string().uuid(),
  timezone: z.string().refine(isIanaZone, "must be an IANA timezone"),
  startDate: z.string().date(),
  endDate: z.string().date(),
  dailyStart: z.string().regex(/^\d{2}:\d{2}$/),
  dailyEnd: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(5).max(480),
  count: z.number().int().min(1).max(10),
});

const routes = new Hono<AuthEnv>();

routes.get("/offers/:publicId", async (c) => {
  const offer = await getOneOffOfferByPublicId(c.req.param("publicId"));
  return offer
    ? c.json({
        publicId: offer.publicId,
        eventTypeSlug: offer.eventTypeSlug,
        eventTypeTitle: offer.eventTypeTitle,
        workspaceSlug: offer.workspaceSlug,
        title: offer.title,
        message: offer.message,
        recipientRestricted: Boolean(offer.recipientEmail),
        slots: offer.slots,
        status: offer.status,
        expiresAt: offer.expiresAt.toISOString(),
      })
    : c.json({ error: "offer_not_found" }, 404);
});

routes.use("/api/me/one-off-offers", requireSession);
routes.use("/api/me/one-off-offers/*", requireSession);

routes.get("/api/me/one-off-offers", async (c) => {
  const user = c.get("user");
  const workspaceId = user.workspaceId;
  const admin = workspaceId ? await isAppAdmin(user.id, undefined, workspaceId) : false;
  return c.json({
    offers: workspaceId ? await listOneOffOffers(workspaceId, admin ? undefined : user.id) : [],
  });
});

/**
 * Times the host is actually free for, best first — the difference between
 * pasting three options into an email and pasting three options the invitee can
 * still book. Applies the event type's buffers and minimum notice, because
 * unlike a poll option an offered slot is booked directly from the link.
 */
routes.post("/api/me/one-off-offers/suggestions", async (c) => {
  const parsed = suggestionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const user = c.get("user");
  if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);

  const eventType = await getEventTypeForAdmin(
    parsed.data.eventTypeId,
    user.id,
    undefined,
    user.workspaceId,
  );
  if (!eventType) return c.json({ error: "event_type_not_found" }, 404);
  if (!isAllowedDuration(
    parsed.data.durationMinutes,
    eventType.durationMinutes,
    eventType.selectableDurations,
  )) {
    return c.json({ error: "invalid_duration" }, 400);
  }

  let requested;
  try {
    requested = suggestionWindow(parsed.data);
  } catch {
    return c.json({ error: "invalid_window" }, 400);
  }

  const [schedule] = await getSchedulesForUsers([user.id]);
  if (!schedule) return c.json({ suggestions: [] });
  const [busy] = await getBusyForUsers([user.id], requested.window);

  const suggestions = suggestOpenSlots(schedule, busy?.intervals ?? [], {
    window: requested.window,
    dailyWindows: requested.dailyWindows,
    durationMinutes: parsed.data.durationMinutes,
    count: parsed.data.count,
    bufferBeforeMin: eventType.bufferBeforeMin,
    bufferAfterMin: eventType.bufferAfterMin,
    minimumNoticeMin: eventType.minimumNoticeMin,
    slotIncrementMin: 15,
    slotTimezone: parsed.data.timezone,
    // A handful of times pasted into an email has to look like real choices.
    // Unspread, top-N returns near-identical neighbours (12:30/12:45/13:00).
    minSeparationMinutes: 60,
    preferDistinctDays: true,
  }, Temporal.Now.instant());

  return c.json({
    suggestions: suggestions.map((slot) => ({
      start: slot.start.toString(),
      end: slot.end.toString(),
    })),
  });
});

routes.post("/api/me/one-off-offers", async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const user = c.get("user");
  if (!user.workspaceId) return c.json({ error: "workspace_not_found" }, 404);
  const eventType = await getEventTypeForAdmin(
    parsed.data.eventTypeId,
    user.id,
    undefined,
    user.workspaceId,
  );
  if (!eventType) return c.json({ error: "event_type_not_found" }, 404);
  const now = Temporal.Now.instant();
  let expiresAt: Temporal.Instant;
  try {
    expiresAt = Temporal.Instant.from(parsed.data.expiresAt);
    if (Temporal.Instant.compare(expiresAt, now) <= 0) throw new Error("past");
    for (const slot of parsed.data.slots) {
      const start = Temporal.Instant.from(slot.start);
      const end = Temporal.Instant.from(slot.end);
      const duration = start.until(end).total({ unit: "minutes" });
      if (
        Temporal.Instant.compare(start, now) <= 0
        || Temporal.Instant.compare(start, end) >= 0
        || !isAllowedDuration(duration, eventType.durationMinutes, eventType.selectableDurations)
      ) throw new Error("invalid slot");
    }
  } catch {
    return c.json({ error: "invalid_slots" }, 400);
  }
  const offer = await createOneOffOffer({
    workspaceId: user.workspaceId,
    ownerUserId: user.id,
    ...parsed.data,
    expiresAt: new Date(expiresAt.epochMilliseconds),
  });
  return offer
    ? c.json(offer, 201)
    : c.json({ error: "event_type_not_found" }, 404);
});

routes.delete("/api/me/one-off-offers/:id", async (c) => {
  const workspaceId = c.get("user").workspaceId;
  const userId = c.get("user").id;
  if (!workspaceId) return c.json({ error: "workspace_not_found" }, 404);
  const admin = await isAppAdmin(userId, undefined, workspaceId);
  return (await revokeOneOffOffer(workspaceId, c.req.param("id"), admin ? undefined : userId))
    ? c.json({ ok: true })
    : c.json({ error: "offer_not_found" }, 404);
});

export const oneOffOfferRoutes = routes;

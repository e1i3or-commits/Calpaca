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

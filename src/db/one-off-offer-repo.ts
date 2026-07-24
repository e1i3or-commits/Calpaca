import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { eventTypes, oneOffOffers, workspaces } from "./schema";
import { generateToken } from "../lib/id";

type Db = NodePgDatabase<typeof schema>;

export type OfferStatus = "active" | "booked" | "revoked" | "expired";

export interface OneOffOffer {
  id: string;
  publicId: string;
  eventTypeId: string;
  eventTypeSlug: string;
  eventTypeTitle: string;
  workspaceSlug: string;
  title: string;
  message: string | null;
  recipientEmail: string | null;
  slots: { start: string; end: string }[];
  status: OfferStatus;
  expiresAt: Date;
  bookingId: string | null;
  createdAt: Date;
}

function effectiveStatus(row: { status: string; expiresAt: Date }, now = new Date()): OfferStatus {
  return row.status === "active" && row.expiresAt <= now
    ? "expired"
    : row.status as OfferStatus;
}

export async function listOneOffOffers(
  workspaceId: string,
  ownerUserId?: string,
  executor: Db = getDb(),
): Promise<OneOffOffer[]> {
  const rows = await executor.select({
    offer: oneOffOffers,
    eventTypeSlug: eventTypes.slug,
    eventTypeTitle: eventTypes.title,
    workspaceSlug: workspaces.slug,
  }).from(oneOffOffers)
    .innerJoin(eventTypes, eq(eventTypes.id, oneOffOffers.eventTypeId))
    .innerJoin(workspaces, eq(workspaces.id, oneOffOffers.workspaceId))
    .where(and(
      eq(oneOffOffers.workspaceId, workspaceId),
      ...(ownerUserId ? [eq(oneOffOffers.ownerUserId, ownerUserId)] : []),
    ))
    .orderBy(desc(oneOffOffers.createdAt));
  return rows.map(({ offer, eventTypeSlug, eventTypeTitle, workspaceSlug }) => ({
    ...offer,
    eventTypeSlug,
    eventTypeTitle,
    workspaceSlug,
    status: effectiveStatus(offer),
  }));
}

export async function createOneOffOffer(
  input: {
    workspaceId: string;
    ownerUserId: string;
    eventTypeId: string;
    title: string;
    message: string | null;
    recipientEmail: string | null;
    slots: { start: string; end: string }[];
    expiresAt: Date;
  },
  executor: Db = getDb(),
): Promise<OneOffOffer | null> {
  const [eventType] = await executor.select({
    slug: eventTypes.slug,
    title: eventTypes.title,
  }).from(eventTypes).where(and(
    eq(eventTypes.id, input.eventTypeId),
    eq(eventTypes.workspaceId, input.workspaceId),
  ));
  if (!eventType) return null;
  const [offer] = await executor.insert(oneOffOffers).values({
    ...input,
    publicId: generateToken(),
  }).returning();
  return offer ? {
    ...offer,
    eventTypeSlug: eventType.slug,
    eventTypeTitle: eventType.title,
    workspaceSlug: (await executor.select({ slug: workspaces.slug }).from(workspaces)
      .where(eq(workspaces.id, input.workspaceId)))[0]!.slug,
    status: effectiveStatus(offer),
  } : null;
}

export async function revokeOneOffOffer(
  workspaceId: string,
  id: string,
  ownerUserId?: string,
  executor: Db = getDb(),
): Promise<boolean> {
  return (await executor.update(oneOffOffers)
    .set({ status: "revoked" })
    .where(and(
      eq(oneOffOffers.id, id),
      eq(oneOffOffers.workspaceId, workspaceId),
      ...(ownerUserId ? [eq(oneOffOffers.ownerUserId, ownerUserId)] : []),
      eq(oneOffOffers.status, "active"),
    ))
    .returning({ id: oneOffOffers.id })).length > 0;
}

export async function getOneOffOfferByPublicId(
  publicId: string,
  executor: Db = getDb(),
): Promise<OneOffOffer | null> {
  const [row] = await executor.select({
    offer: oneOffOffers,
    eventTypeSlug: eventTypes.slug,
    eventTypeTitle: eventTypes.title,
    workspaceSlug: workspaces.slug,
  }).from(oneOffOffers)
    .innerJoin(eventTypes, eq(eventTypes.id, oneOffOffers.eventTypeId))
    .innerJoin(workspaces, eq(workspaces.id, oneOffOffers.workspaceId))
    .where(eq(oneOffOffers.publicId, publicId));
  return row ? {
    ...row.offer,
    eventTypeSlug: row.eventTypeSlug,
    eventTypeTitle: row.eventTypeTitle,
    workspaceSlug: row.workspaceSlug,
    status: effectiveStatus(row.offer),
  } : null;
}

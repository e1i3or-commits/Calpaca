import { eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import {
  eventTypeHosts,
  eventTypes,
  timeSuggestions,
  users,
} from "./schema";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export interface SuggestionSlot {
  readonly start: string;
  readonly end: string;
}

export interface SuggestionEventType {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly theme?: string;
  readonly logoUrl?: string | null;
}

export interface TimeSuggestionInput {
  readonly inviteeEmail: string;
  readonly inviteeName: string;
  readonly inviteeTimezone: string;
  readonly proposedSlots: readonly SuggestionSlot[];
  readonly message?: string;
}

export interface TimeSuggestionContext extends TimeSuggestionInput {
  readonly id: string;
  readonly eventType: SuggestionEventType;
  readonly hosts: readonly {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly timezone: string;
  }[];
}

export async function getSuggestionEventTypeBySlug(
  slug: string,
  executor: Db = getDb(),
): Promise<SuggestionEventType | null> {
  const [row] = await executor
    .select({
      id: eventTypes.id,
      slug: eventTypes.slug,
      title: eventTypes.title,
      theme: eventTypes.theme,
      logoUrl: eventTypes.logoUrl,
    })
    .from(eventTypes)
    .where(eq(eventTypes.slug, slug));
  return row ?? null;
}

export async function createTimeSuggestion(
  eventTypeId: string,
  input: TimeSuggestionInput,
  executor: Db = getDb(),
): Promise<string> {
  const [row] = await executor
    .insert(timeSuggestions)
    .values({
      eventTypeId,
      inviteeEmail: input.inviteeEmail,
      inviteeName: input.inviteeName,
      inviteeTimezone: input.inviteeTimezone,
      proposedSlots: [...input.proposedSlots],
      message: input.message ?? null,
    })
    .returning({ id: timeSuggestions.id });
  if (!row) throw new Error("time suggestion insert returned no row");
  return row.id;
}

export async function getTimeSuggestionContext(
  id: string,
  executor: Db = getDb(),
): Promise<TimeSuggestionContext | null> {
  const [row] = await executor
    .select({
      id: timeSuggestions.id,
      eventTypeId: eventTypes.id,
      eventTypeSlug: eventTypes.slug,
      eventTypeTitle: eventTypes.title,
      eventTypeTheme: eventTypes.theme,
      eventTypeLogoUrl: eventTypes.logoUrl,
      inviteeEmail: timeSuggestions.inviteeEmail,
      inviteeName: timeSuggestions.inviteeName,
      inviteeTimezone: timeSuggestions.inviteeTimezone,
      proposedSlots: timeSuggestions.proposedSlots,
      message: timeSuggestions.message,
    })
    .from(timeSuggestions)
    .innerJoin(eventTypes, eq(eventTypes.id, timeSuggestions.eventTypeId))
    .where(eq(timeSuggestions.id, id));
  if (!row) return null;

  const hostIds = await executor
    .select({ id: eventTypeHosts.userId })
    .from(eventTypeHosts)
    .where(eq(eventTypeHosts.eventTypeId, row.eventTypeId));
  const hostRows = hostIds.length
    ? await executor
        .select({ id: users.id, name: users.name, email: users.email, timezone: users.timezone })
        .from(users)
        .where(inArray(users.id, hostIds.map((host) => host.id)))
    : [];

  return {
    id: row.id,
    eventType: {
      id: row.eventTypeId,
      slug: row.eventTypeSlug,
      title: row.eventTypeTitle,
      theme: row.eventTypeTheme,
      logoUrl: row.eventTypeLogoUrl,
    },
    inviteeEmail: row.inviteeEmail,
    inviteeName: row.inviteeName,
    inviteeTimezone: row.inviteeTimezone,
    proposedSlots: row.proposedSlots,
    ...(row.message ? { message: row.message } : {}),
    hosts: hostRows,
  };
}

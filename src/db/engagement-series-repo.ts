import { and, asc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EngagementStatus } from "../core/engagement/model";
import type { EngagementActor } from "../core/engagement/permissions";
import { canManageEngagement } from "../core/engagement/permissions";
import {
  onboardingStage,
  seriesMeetings,
  seriesProgress,
  type BookingInput,
  type EventTypeInput,
  type OnboardingStage,
  type SeriesMeeting,
  type SeriesMeetingKind,
} from "../core/engagement/series";
import type { FollowupRule, ScheduleStatus } from "../core/engagement/followup-schedule";
import { getDb } from "./client";
import { listEngagements } from "./engagement-repo";
import * as s from "./schema";

type Db = NodePgDatabase<typeof s>;

export interface SeriesPerson {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** The Engagement role: account_lead, creator, franchise_success, or what was given. */
  readonly role: string;
  /** How the follow-up roster invites them; null when they are not on it. */
  readonly attendance: "required" | "optional" | null;
}

export interface SeriesEventType {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: SeriesMeetingKind;
  /** Whether an outside person can book it at its public link today. */
  readonly published: boolean;
}

export interface EngagementSeriesSummary {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: EngagementStatus;
  readonly clientId: string;
  readonly clientName: string;
  readonly accountLeadUserId: string;
  readonly accountLeadName: string;
  readonly updatedAt: string;
  /** Present for a franchise onboarding: the source records it was provisioned from. */
  readonly onboarding: {
    readonly sourceWorkspaceId: string;
    readonly sourceProjectKey: string;
    readonly locationKey: string;
    readonly locationName: string;
    readonly franchiseeId: string;
    readonly stage: OnboardingStage;
  } | null;
  readonly cadence: string | null;
  readonly schedule: { readonly status: ScheduleStatus; readonly rule: FollowupRule; readonly revision: number } | null;
  readonly progress: {
    readonly held: number;
    readonly total: number;
    readonly noShows: number;
    readonly next: SeriesMeeting | null;
    readonly lastHeld: SeriesMeeting | null;
  };
  readonly people: readonly SeriesPerson[];
  readonly eventTypes: readonly SeriesEventType[];
  readonly canManage: boolean;
}

export interface EngagementSeriesDetail extends EngagementSeriesSummary {
  readonly meetings: readonly SeriesMeeting[];
}

/**
 * Engagements the actor can see, each read as a meeting series. Access is
 * exactly listEngagements' (and so getEngagement's): this adds reads, never
 * visibility. Six queries for any number of Engagements.
 */
async function load(
  workspaceId: string,
  actor: EngagementActor,
  filters: { status?: EngagementStatus; id?: string },
  db: Db,
  now: Date,
): Promise<EngagementSeriesDetail[]> {
  const base = (await listEngagements(workspaceId, actor, filters.status ? { status: filters.status } : {}, db))
    .filter((e) => !filters.id || e.id === filters.id);
  if (filters.id && !base.length) {
    // listEngagements leaves archived ones out unless asked for by status.
    const archived = await listEngagements(workspaceId, actor, { status: "archived" }, db);
    base.push(...archived.filter((e) => e.id === filters.id));
  }
  if (!base.length) return [];
  const ids = base.map((e) => e.id);

  const [onboardings, eventTypes, people] = await Promise.all([
    db.select().from(s.franchiseOnboarding)
      .where(and(eq(s.franchiseOnboarding.workspaceId, workspaceId), inArray(s.franchiseOnboarding.engagementId, ids))),
    db.select({ id: s.eventTypes.id, slug: s.eventTypes.slug, title: s.eventTypes.title, engagementId: s.eventTypes.engagementId })
      .from(s.eventTypes)
      .where(and(eq(s.eventTypes.workspaceId, workspaceId), inArray(s.eventTypes.engagementId, ids))),
    db.select({ engagementId: s.engagementPeople.engagementId, userId: s.users.id, name: s.users.name, email: s.users.email, role: s.engagementPeople.role })
      .from(s.engagementPeople)
      .innerJoin(s.users, eq(s.users.id, s.engagementPeople.userId))
      .where(inArray(s.engagementPeople.engagementId, ids))
      .orderBy(asc(s.users.name)),
  ]);
  const onboardingIds = onboardings.map((o) => o.id);
  const eventTypeIds = eventTypes.map((t) => t.id);
  const none = Promise.resolve([] as never[]);
  const [kickoffs, checkins, followups, oneOffs, schedules, occurrences, reservations, bookings] = await Promise.all([
    onboardingIds.length ? db.select().from(s.onboardingKickoffs).where(inArray(s.onboardingKickoffs.onboardingId, onboardingIds)) : none,
    onboardingIds.length ? db.select().from(s.onboardingCheckins).where(inArray(s.onboardingCheckins.onboardingId, onboardingIds)) : none,
    onboardingIds.length ? db.select().from(s.onboardingFollowups).where(inArray(s.onboardingFollowups.onboardingId, onboardingIds)) : none,
    onboardingIds.length ? db.select({ eventTypeId: s.onboardingOneOffs.eventTypeId }).from(s.onboardingOneOffs).where(inArray(s.onboardingOneOffs.onboardingId, onboardingIds)) : none,
    onboardingIds.length ? db.select().from(s.onboardingFollowupSchedules).where(inArray(s.onboardingFollowupSchedules.onboardingId, onboardingIds)) : none,
    onboardingIds.length
      ? db.select().from(s.onboardingFollowupOccurrences).where(inArray(s.onboardingFollowupOccurrences.onboardingId, onboardingIds)).orderBy(asc(s.onboardingFollowupOccurrences.position))
      : none,
    onboardingIds.length
      ? db.select({ occurrenceId: s.followupReservations.occurrenceId, bookingId: s.followupReservations.bookingId })
        .from(s.followupReservations).where(inArray(s.followupReservations.onboardingId, onboardingIds))
      : none,
    eventTypeIds.length
      ? db.select({
          id: s.bookings.id, eventTypeId: s.bookings.eventTypeId, startsAt: s.bookings.startsAt, endsAt: s.bookings.endsAt,
          status: s.bookings.status, inviteStatus: s.bookings.inviteStatus, inviteeName: s.bookings.inviteeName, hostUserIds: s.bookings.hostUserIds,
        }).from(s.bookings).where(inArray(s.bookings.eventTypeId, eventTypeIds))
      : none,
  ]);

  const kindOf = new Map<string, SeriesMeetingKind>();
  for (const k of kickoffs) kindOf.set(k.eventTypeId, "kickoff");
  for (const c of checkins) kindOf.set(c.eventTypeId, "checkin");
  for (const f of followups) kindOf.set(f.eventTypeId, "followup");
  for (const o of oneOffs) kindOf.set(o.eventTypeId, "one_off");
  const publishedAt = new Map<string, Date | null>([
    ...kickoffs.map((k) => [k.eventTypeId, k.publishedAt] as const),
    ...checkins.map((c) => [c.eventTypeId, c.publishedAt] as const),
  ]);
  const bookingById = new Map<string, BookingInput>(bookings.map((b) => [b.id, b]));
  const bookingFor = new Map(reservations.filter((r) => r.bookingId).map((r) => [r.occurrenceId, bookingById.get(r.bookingId!) ?? null]));

  return base.map((e) => {
    const onboarding = onboardings.find((o) => o.engagementId === e.id) ?? null;
    const types: (EventTypeInput & SeriesEventType)[] = eventTypes
      .filter((t) => t.engagementId === e.id)
      .map((t) => {
        const kind = kindOf.get(t.id) ?? "conversation";
        // Follow-ups and one-offs are booked for the franchisee, never at a public link.
        const published = kind === "kickoff" || kind === "checkin" ? Boolean(publishedAt.get(t.id)) : kind === "conversation";
        return { id: t.id, slug: t.slug, title: t.title, kind, published };
      })
      .sort((a, b) => seriesMeetingKindsOrder(a.kind) - seriesMeetingKindsOrder(b.kind) || a.title.localeCompare(b.title));
    const typeIds = new Set(types.map((t) => t.id));
    const schedule = onboarding ? schedules.find((x) => x.onboardingId === onboarding.id) ?? null : null;
    const followupType = types.find((t) => t.kind === "followup");
    const meetings = seriesMeetings({
      eventTypes: types,
      bookings: bookings.filter((b) => typeIds.has(b.eventTypeId)),
      occurrences: onboarding
        ? occurrences.filter((o) => o.onboardingId === onboarding.id).map((o) => ({ ...o, booking: bookingFor.get(o.id) ?? null }))
        : [],
      followupTitle: followupType?.title ?? "Follow-up",
      now,
    });
    const progress = seriesProgress(meetings, now);
    const attendance = new Map((onboarding?.attendance.followup ?? []).map((h) => [h.userId, h.role]));
    const roster = new Set((onboarding?.attendance.kickoff ?? []).map((h) => h.userId));
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      status: e.status,
      clientId: e.clientId,
      clientName: e.clientName,
      accountLeadUserId: e.accountLeadUserId,
      accountLeadName: e.accountLeadName,
      updatedAt: e.updatedAt.toISOString(),
      onboarding: onboarding
        ? {
            sourceWorkspaceId: onboarding.sourceWorkspaceId,
            sourceProjectKey: onboarding.sourceProjectKey,
            locationKey: onboarding.input.locationKey,
            locationName: onboarding.input.locationName,
            franchiseeId: onboarding.franchiseeId,
            stage: onboardingStage(meetings, schedule?.status ?? null),
          }
        : null,
      cadence: schedule?.rule.cadence ?? onboarding?.cadence ?? null,
      schedule: schedule && onboarding ? { status: schedule.status, rule: schedule.rule, revision: onboarding.revision } : null,
      progress,
      people: people
        .filter((p) => p.engagementId === e.id)
        .map((p) => ({
          userId: p.userId, name: p.name, email: p.email, role: p.role,
          attendance: attendance.get(p.userId) ?? (roster.has(p.userId) ? "required" : null),
        })),
      eventTypes: types.map(({ id, slug, title, kind, published }) => ({ id, slug, title, kind, published })),
      canManage: canManageEngagement(actor, e),
      meetings,
    };
  });
}

const kindOrder: Record<SeriesMeetingKind, number> = { kickoff: 0, followup: 1, checkin: 2, one_off: 3, conversation: 4 };
const seriesMeetingKindsOrder = (k: SeriesMeetingKind) => kindOrder[k];

/**
 * The list leaves each series' meetings out; the detail read carries them.
 * With `meetings`, each summary also carries its booked meetings (not planned
 * dates) that start in [from, to): a calendar outside Calpaca shows those
 * beside other bookings without reading every Engagement.
 */
export async function listEngagementSeries(
  workspaceId: string,
  actor: EngagementActor,
  filters: { status?: EngagementStatus; meetings?: { from: Date; to: Date } } = {},
  db: Db = getDb(),
  now = new Date(),
): Promise<(EngagementSeriesSummary & { meetings?: readonly SeriesMeeting[] })[]> {
  const window = filters.meetings;
  return (await load(workspaceId, actor, filters.status ? { status: filters.status } : {}, db, now)).map((detail) => {
    const summary: { meetings?: readonly SeriesMeeting[] } & EngagementSeriesSummary = { ...detail };
    if (window) {
      summary.meetings = detail.meetings.filter((m) => m.bookingId && Date.parse(m.startsAt) >= window.from.getTime() && Date.parse(m.startsAt) < window.to.getTime());
    } else delete summary.meetings;
    return summary;
  });
}

export async function getEngagementSeries(
  workspaceId: string,
  actor: EngagementActor,
  engagementId: string,
  db: Db = getDb(),
  now = new Date(),
): Promise<EngagementSeriesDetail | null> {
  const [found] = await load(workspaceId, actor, { id: engagementId }, db, now);
  return found ?? null;
}

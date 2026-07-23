import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export interface AnalyticsReport {
  readonly outcomes: readonly {
    eventTypeSlug: string;
    month: string;
    status: "confirmed" | "cancelled" | "no_show";
    count: number;
  }[];
  readonly leadTime: readonly {
    eventTypeSlug: string;
    bookingCount: number;
    averageHours: number;
    medianHours: number;
  }[];
  readonly noShowRates: readonly {
    eventTypeSlug: string;
    completedCount: number;
    noShowCount: number;
    noShowRate: number;
  }[];
  readonly roundRobin: readonly {
    eventTypeSlug: string;
    hostName: string;
    hostEmail: string;
    weight: number;
    bookingCount: number;
    bookingShare: number;
    weightShare: number;
  }[];
}

export async function getAnalyticsReport(
  userId: string,
  from: Date,
  to: Date,
  executor: Db = getDb(),
): Promise<AnalyticsReport> {
  const scope = sql`
    (
      et.owner_user_id = ${userId}
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = et.team_id AND tm.user_id = ${userId}
      )
      OR EXISTS (
        SELECT 1 FROM event_type_hosts visible_host
        WHERE visible_host.event_type_id = et.id AND visible_host.user_id = ${userId}
      )
    )
  `;
  const [outcomes, leadTime, noShowRates, roundRobin] = await Promise.all([
    executor.execute<{
      event_type_slug: string;
      month: string;
      final_status: "confirmed" | "cancelled" | "no_show";
      booking_count: string;
    }>(sql`
      SELECT a.event_type_slug,
             to_char(a.calendar_month_utc, 'YYYY-MM') AS month,
             a.final_status,
             a.booking_count::text
      FROM analytics_booking_outcomes a
      JOIN event_types et ON et.id = a.event_type_id
      WHERE ${scope}
        AND a.calendar_month_utc >= ${from}
        AND a.calendar_month_utc < ${to}
      ORDER BY a.calendar_month_utc, a.event_type_slug, a.final_status
    `),
    executor.execute<{
      event_type_slug: string;
      booking_count: string;
      average_seconds: string;
      median_seconds: string;
    }>(sql`
      SELECT a.event_type_slug,
             count(*)::text AS booking_count,
             avg(extract(epoch FROM a.lead_time))::text AS average_seconds,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY extract(epoch FROM a.lead_time)
             )::text AS median_seconds
      FROM analytics_lead_time a
      JOIN event_types et ON et.id = a.event_type_id
      WHERE ${scope} AND a.starts_at >= ${from} AND a.starts_at < ${to}
      GROUP BY a.event_type_slug
      ORDER BY a.event_type_slug
    `),
    executor.execute<{
      event_type_slug: string;
      completed_count: string;
      no_show_count: string;
      no_show_rate: string;
    }>(sql`
      SELECT a.event_type_slug, a.completed_count::text,
             a.no_show_count::text, a.no_show_rate::text
      FROM analytics_no_show_rate a
      JOIN event_types et ON et.id = a.event_type_id
      WHERE ${scope}
      ORDER BY a.no_show_rate DESC, a.event_type_slug
    `),
    executor.execute<{
      event_type_slug: string;
      host_name: string;
      host_email: string;
      weight: number;
      booking_count: string;
      booking_share: string;
      weight_share: string;
    }>(sql`
      SELECT a.event_type_slug, a.host_name, a.host_email, a.weight,
             a.booking_count::text, a.booking_share::text, a.weight_share::text
      FROM analytics_rr_distribution a
      JOIN event_types et ON et.id = a.event_type_id
      WHERE ${scope}
      ORDER BY a.event_type_slug, a.host_name
    `),
  ]);

  return {
    outcomes: outcomes.rows.map((row) => ({
      eventTypeSlug: row.event_type_slug,
      month: row.month,
      status: row.final_status,
      count: Number(row.booking_count),
    })),
    leadTime: leadTime.rows.map((row) => ({
      eventTypeSlug: row.event_type_slug,
      bookingCount: Number(row.booking_count),
      averageHours: Number(row.average_seconds) / 3600,
      medianHours: Number(row.median_seconds) / 3600,
    })),
    noShowRates: noShowRates.rows.map((row) => ({
      eventTypeSlug: row.event_type_slug,
      completedCount: Number(row.completed_count),
      noShowCount: Number(row.no_show_count),
      noShowRate: Number(row.no_show_rate),
    })),
    roundRobin: roundRobin.rows.map((row) => ({
      eventTypeSlug: row.event_type_slug,
      hostName: row.host_name,
      hostEmail: row.host_email,
      weight: row.weight,
      bookingCount: Number(row.booking_count),
      bookingShare: Number(row.booking_share),
      weightShare: Number(row.weight_share),
    })),
  };
}

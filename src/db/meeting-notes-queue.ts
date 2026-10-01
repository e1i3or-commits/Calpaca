import { sql } from "drizzle-orm";
import { getDb } from "./client";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
type Db = NodePgDatabase<typeof schema>;
export type MeetingNotesOutcome = "defer" | "no_notes" | "pending" | "complete" | "failed";

/** Reconcile candidates before checking calendar delivery. No moving lower
 * bound: missed runs and late delivery cannot age out of discovery. */
export async function claimMeetingNotes(workspaceId: string, since: Date, now = new Date(), db: Db = getDb()) {
  return db.transaction(async tx => {
    await tx.execute(sql`insert into meeting_notes_workers(workspace_id, since, last_polled_at)
      values (${workspaceId}, ${since.toISOString()}, ${now.toISOString()})
      on conflict (workspace_id) do update set last_polled_at = excluded.last_polled_at`);
    const state = await tx.execute<{since: Date}>(sql`select since from meeting_notes_workers where workspace_id=${workspaceId}`);
    if (new Date(state.rows[0]!.since).getTime() !== since.getTime()) throw new Error("meeting_notes_start_conflict");
    const settled = new Date(now.getTime() - 20 * 60_000);
    await tx.execute(sql`insert into meeting_notes_jobs(workspace_id, booking_id, next_attempt_at)
      select f.workspace_id, b.id, ${now.toISOString()}::timestamptz
      from (select booking_id,onboarding_id from followup_reservations
        union all select b.id,o.onboarding_id from onboarding_one_offs o join bookings b on b.event_type_id=o.event_type_id) r join bookings b on b.id=r.booking_id
      join franchise_onboarding f on f.id=r.onboarding_id
      where f.workspace_id=${workspaceId} and b.status='confirmed'
        and b.ends_at > ${since.toISOString()}::timestamptz and b.ends_at <= ${settled.toISOString()}::timestamptz
      on conflict (workspace_id, booking_id) do nothing`);
    // Cancelled jobs remain auditable, but cannot starve due confirmed jobs.
    await tx.execute(sql`update meeting_notes_jobs j set completed_at=${now.toISOString()}::timestamptz,
      lease_token=null, lease_until=null, last_issue='booking_cancelled'
      from bookings b where b.id=j.booking_id and j.workspace_id=${workspaceId}
      and j.completed_at is null and b.status <> 'confirmed'`);
    const token: string = crypto.randomUUID();
    const claimed = await tx.execute<{booking_id:string; attempts:number}>(sql`
      with candidate as (
        select j.booking_id from meeting_notes_jobs j join bookings b on b.id=j.booking_id
        where j.workspace_id=${workspaceId} and j.completed_at is null
          and j.next_attempt_at <= ${now.toISOString()}::timestamptz
          and (j.lease_until is null or j.lease_until <= ${now.toISOString()}::timestamptz)
          and b.status='confirmed' and b.ends_at <= ${settled.toISOString()}::timestamptz
        order by j.next_attempt_at,j.booking_id for update of j skip locked limit 1
      ) update meeting_notes_jobs j set lease_token=${token},
        lease_until=${new Date(now.getTime()+10*60_000).toISOString()}::timestamptz,
        next_attempt_at=${new Date(now.getTime()+10*60_000).toISOString()}::timestamptz,
        last_issue=case when j.lease_token is not null then 'processing_interrupted' else j.last_issue end,
        attempts=j.attempts+1, last_attempt_at=${now.toISOString()}::timestamptz
      from candidate c where j.workspace_id=${workspaceId} and j.booking_id=c.booking_id
      returning j.booking_id,j.attempts`);
    const job=claimed.rows[0];
    return job ? {bookingId:job.booking_id, leaseToken:token, attempts:job.attempts} : null;
  });
}

/** Resolve exactly the claimed booking, including a missing delivery as an
 * explicit issue. This avoids dropping candidates from a paginated scan. */
export async function readClaimedMeeting(workspaceId:string, bookingId:string, db:Db=getDb()) {
  const row=await db.execute<{starts_at:Date;ends_at:Date;source_project_key:string;source_workspace_id:string}>(sql`
    select b.starts_at,b.ends_at,f.source_project_key,f.source_workspace_id
    from (select booking_id,onboarding_id from followup_reservations
        union all select b.id,o.onboarding_id from onboarding_one_offs o join bookings b on b.event_type_id=o.event_type_id) r join bookings b on b.id=r.booking_id
    join franchise_onboarding f on f.id=r.onboarding_id
    where f.workspace_id=${workspaceId} and b.id=${bookingId} and b.status='confirmed'`);
  const b=row.rows[0];if(!b)return null;
  const deliveries=await db.execute<{calendar_id:string|null;google_event_id:string;snapshot:{hosts:{id:string}[]}}>(sql`
    select calendar_id,google_event_id,snapshot from kickoff_deliveries
    where workspace_id=${workspaceId} and booking_id=${bookingId} and kind in ('created','rescheduled') and status='delivered'
    order by sequence desc limit 1`);
  const delivery=deliveries.rows[0],organizer=delivery?.snapshot.hosts[0];
  return {bookingId,sourceProjectKey:b.source_project_key,sourceWorkspaceId:b.source_workspace_id,
    startsAt:new Date(b.starts_at).toISOString(),endsAt:new Date(b.ends_at).toISOString(),
    calendar:delivery?.calendar_id&&organizer?{organizerUserId:organizer.id,calendarId:delivery.calendar_id,eventId:delivery.google_event_id}:null};
}

export async function finishMeetingNotes(workspaceId:string, bookingId:string, leaseToken:string, outcome:MeetingNotesOutcome, now=new Date(), db:Db=getDb()) {
  // Existing reviews need occasional refresh; do not let them crowd out new meetings.
  const delay=outcome==='no_notes'?24*3600_000:outcome==='pending'?6*3600_000:15*60_000;
  const r=await db.execute(sql`update meeting_notes_jobs set
    completed_at=${outcome==='complete'?now.toISOString():null}::timestamptz,
    next_attempt_at=${new Date(now.getTime()+delay).toISOString()}::timestamptz,
    last_succeeded_at=case when ${outcome}<>'failed' then ${now.toISOString()}::timestamptz else last_succeeded_at end,
    last_issue=case when ${outcome}='failed' then 'processing_failed' else null end,
    lease_token=null,lease_until=null
    where workspace_id=${workspaceId} and booking_id=${bookingId} and lease_token=${leaseToken}
      and lease_until > ${now.toISOString()}::timestamptz and completed_at is null
    returning booking_id`);
  return r.rowCount===1;
}

export async function meetingNotesHealth(workspaceId:string, now=new Date(), db:Db=getDb()) {
  const state=await db.execute<{last_polled_at:Date;since:Date}>(sql`select last_polled_at,since from meeting_notes_workers where workspace_id=${workspaceId}`);
  const counts=await db.execute<{pending:number;failed:number;expired:number;oldest_due:Date|null}>(sql`
    select count(*)::int as pending,
      count(*) filter(where last_issue is not null and b.ends_at <= ${new Date(now.getTime()-20*60_000).toISOString()}::timestamptz)::int as failed,
      count(*) filter(where lease_until <= ${now.toISOString()}::timestamptz and b.ends_at <= ${new Date(now.getTime()-20*60_000).toISOString()}::timestamptz)::int as expired,
      min(greatest(next_attempt_at,b.ends_at+interval '20 minutes')) as oldest_due
    from meeting_notes_jobs j join bookings b on b.id=j.booking_id
    where j.workspace_id=${workspaceId} and completed_at is null and b.status='confirmed'`);
  return {worker:state.rows[0]??null,...counts.rows[0]};
}

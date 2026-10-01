import { useEffect, useRef, useState } from "react";
import { ApiError, createOneOffMeeting, listOneOffMeetings, type EngagementDetail, type OneOffMeeting } from "@/lib/api";
const control="min-h-11 rounded-lg border border-input bg-background px-3 text-sm";
const button="min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50";
export function OneOffMeetingsPanel({engagement}:{engagement:EngagementDetail}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [title,setTitle]=useState(`${engagement.clientName} follow-up`),[duration,setDuration]=useState(45);
  const [attendees,setAttendees]=useState<Record<string,"required"|"optional">>(()=>Object.fromEntries((engagement.onboarding?.attendance.followup??[]).map(person=>[person.userId,person.role])));
  const [meetings,setMeetings]=useState<OneOffMeeting[]>([]);
  const [canCreate,setCanCreate]=useState(false);
  const request=useRef<{fingerprint:string;id:string}|null>(null);
  useEffect(()=>{let alive=true;listOneOffMeetings(engagement.id).then(data=>{if(alive){setMeetings(data.meetings);setCanCreate(true);}}).catch(e=>{if(alive&&!(e instanceof ApiError&&e.status===404))setError("One-off meetings could not be loaded. Refresh the page to retry.");});return()=>{alive=false;};},[engagement.id]);
  async function create() {
    const value={title,durationMinutes:duration,attendees:Object.entries(attendees).map(([userId,role])=>({userId,role}))};
    const fingerprint=JSON.stringify(value);
    if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
    setBusy(true);setError(null);
    try {const result=await createOneOffMeeting(engagement.id,{...value,requestId:request.current.id});window.location.assign(result.bookingPath);}
    catch(e){setError(e instanceof ApiError&&e.code==="organizer_required"?"Keep the account lead as a required attendee to organize this meeting.":"The meeting could not be prepared. Check the attendees and try again; retrying will not create a duplicate.");setBusy(false);}
  }
  return <section className="mt-4" aria-label="One-off meetings">
    <div className="flex flex-wrap items-center gap-3">{canCreate&&<button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={engagement.status!=="active"||busy} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Book a one-off meeting</button>}<a className="inline-flex min-h-11 items-center px-3 text-sm text-primary" href="#meeting-invitations">Review invitations</a></div>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {open&&<form className="mt-4 rounded-lg border border-border p-4" onSubmit={event=>{event.preventDefault();void create();}}>
      <h4 className="font-medium">1. Choose the meeting and attendees</h4>
      <p className="mt-1 text-sm text-muted-foreground">Next, choose a time from the required team’s availability and confirm the client’s details. Confirmation sends invitations. Meeting notes will be checked for suggested Tyger changes after the call.</p>
      <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Meeting title<input required maxLength={160} className={control} value={title} onChange={event=>setTitle(event.target.value)}/></label>
        <label className="grid gap-1 text-sm">Duration (minutes)<input required type="number" min={15} max={180} step={5} className={control} value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label>
        {engagement.people.map(person=><label key={person.userId} className="grid gap-1 text-sm">{person.name}{person.userId===engagement.accountLeadUserId?" · organizer":""}<select className={control} value={attendees[person.userId]??"none"} disabled={person.userId===engagement.accountLeadUserId} onChange={event=>setAttendees(current=>{const next={...current};if(event.target.value==="none")delete next[person.userId];else next[person.userId]=event.target.value as "required"|"optional";return next;})}><option value="required">Required</option><option value="optional">Optional</option><option value="none">Not attending</option></select></label>)}
      </fieldset>
      <div className="mt-4 flex gap-3"><button className={button} disabled={busy}>{busy?"Preparing…":"Choose an available time"}</button><button type="button" className={button} disabled={busy} onClick={()=>setOpen(false)}>Cancel</button></div>
    </form>}
    {meetings.length>0&&<div className="mt-5"><h4 className="font-medium">One-off meetings</h4><ul className="mt-2 divide-y divide-border">{meetings.map(meeting=><li key={meeting.eventTypeId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{meeting.title}</p><p className="text-muted-foreground">{meeting.durationMinutes} minutes · {meeting.startsAt?`${new Date(meeting.startsAt).toLocaleString()} · Invitation ${(meeting.inviteStatus??"pending").replaceAll("_"," ")}`:"Choose a time to send invitations"}</p></div>{!meeting.bookingId&&<a className="inline-flex min-h-11 items-center text-primary" href={`/book/${encodeURIComponent(meeting.slug)}`}>Choose a time</a>}</li>)}</ul></div>}
  </section>;
}

import { useEffect, useState } from "react";
import { ApiError, applyFollowupSchedule, getFollowupSchedule, previewFollowupSchedule, type EngagementDetail, type FollowupPreviewInput, type FollowupRule, type SchedulePreview, type ScheduleSnapshot } from "@/lib/api";

const control = "min-h-11 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50";
const button = "min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50";
const messages: Record<string,string> = {
  issued_schedule_requires_reconciliation: "Follow-up bookings exist. Calendar changes must be reconciled before editing this schedule.",
  revision_conflict: "The schedule changed. Refresh it and preview your changes again.",
  preview_changed: "The preview is out of date. Refresh and preview again before saving.",
  engagement_paused: "This Engagement is paused. Resume the Engagement before editing its schedule.",
  engagement_closed: "This Engagement is closed. Its schedule history is preserved.",
  forbidden: "Only the account lead or a workspace administrator can change this schedule.",
  invalid_input: "Check the date, time, timezone and number of meetings.",
  request_conflict: "This save request has already been used. Refresh and preview again.",
};
function explain(error:unknown) { return error instanceof ApiError ? messages[error.code] ?? "The request could not be confirmed. Refresh to check the saved schedule; a repeated save will not create duplicates." : "The request could not be confirmed. Check your connection and retry."; }
export function FollowupSchedulePanel({engagement,reload}:{engagement:EngagementDetail;reload:()=>Promise<void>}) {
  const [snapshot,setSnapshot]=useState<ScheduleSnapshot|null>(null);
  const [rule,setRule]=useState<FollowupRule>({cadence:engagement.onboarding?.cadence??"biweekly",anchorDate:"",localTime:"10:00",timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,monthlyMode:"weekday_position",count:6});
  const [busy,setBusy]=useState(false), [error,setError]=useState<string|null>(null), [notice,setNotice]=useState<string|null>(null);
  const [pending,setPending]=useState<{input:FollowupPreviewInput;preview:SchedulePreview;previewHash:string;requestId:string}|null>(null);
  const [moving,setMoving]=useState<string|null>(null),[moveDate,setMoveDate]=useState(""),[moveTime,setMoveTime]=useState("");
  useEffect(()=>{
    let alive=true;
    getFollowupSchedule(engagement.id).then(data=>{if(alive){setSnapshot(data);if(data.schedule)setRule(data.schedule.rule);setPending(null);}}).catch(e=>{if(alive)setError(explain(e));});
    return()=>{alive=false;};
  },[engagement.id,engagement.onboarding?.revision,engagement.status]);
  async function refresh() {
    setBusy(true);setError(null);
    try {const data=await getFollowupSchedule(engagement.id);setSnapshot(data);if(data.schedule)setRule(data.schedule.rule);setPending(null);setMoving(null);}catch(e){setError(explain(e));}finally{setBusy(false);}
  }
  async function preview(command:FollowupPreviewInput["command"]) {
    if(!snapshot)return;
    setBusy(true);setError(null);setNotice(null);setPending(null);
    try {const input={revision:snapshot.revision,command};const result=await previewFollowupSchedule(engagement.id,input);setPending({...result,input,requestId:crypto.randomUUID()});}catch(e){setError(explain(e));}finally{setBusy(false);}
  }
  async function save() {
    if(!pending)return;
    setBusy(true);setError(null);
    try {const data=await applyFollowupSchedule(engagement.id,{...pending.input,previewHash:pending.previewHash,requestId:pending.requestId});setSnapshot(data);if(data.schedule)setRule(data.schedule.rule);setPending(null);setMoving(null);setNotice("Draft schedule saved. Invitations have not been sent.");await reload();}catch(e){setError(explain(e));}finally{setBusy(false);}
  }
  const schedule=snapshot?.schedule;
  const locked=busy||snapshot?.deliveryState==="reservations_present"||!snapshot?.canManage||["paused","completed","archived"].includes(engagement.status)||schedule?.status==="ended";
  const zone=rule.timezone;
  const format=(value:string,timezone=zone)=>{try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value));}catch{return value;}};
  const update=(patch:Partial<FollowupRule>)=>{setRule(value=>({...value,...patch}));setPending(null);setNotice(null);};
  return <section className="mt-6 rounded-lg border border-border p-4" aria-labelledby="followup-schedule-title">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 id="followup-schedule-title" className="font-medium">Follow-up schedule</h4><button className={button} disabled={busy} onClick={()=>void refresh()}>Refresh schedule</button></div>
    <p className="mt-2 text-sm text-muted-foreground">Plan 45-minute follow-ups in the agreed timezone. Dates stay as drafts until availability and invitation delivery are ready.</p>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
    {!snapshot?<p role="status" className="mt-3 text-sm">{error?"Schedule unavailable. Use Refresh schedule to retry.":"Loading follow-up schedule…"}</p>:<>
      {schedule&&<p className="mt-3 text-sm font-medium">{schedule.status==="planned"?(snapshot.deliveryState==="reservations_present"?"Schedule with bookings":"Draft schedule"):schedule.status==="paused"?"Schedule paused":"Schedule ended"} · {schedule.rule.timezone}</p>}
      {snapshot.deliveryState==="reservations_present"&&<p role="status" className="mt-2 text-sm">Follow-up bookings exist. Calendar changes must be reconciled before editing this schedule. Each meeting shows its invitation status below.</p>}
      {["paused","completed","archived"].includes(engagement.status)&&<p className="mt-2 text-sm text-muted-foreground">The Engagement is {engagement.status}. Schedule changes are disabled.</p>}
      {schedule?.status!=="ended"&&<form className="mt-4" onSubmit={event=>{event.preventDefault();void preview({action:"configure",rule});}}>
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-sm">Follow-up cadence<select className={control} value={rule.cadence} onChange={event=>update({cadence:event.target.value as FollowupRule["cadence"]})}><option value="weekly">Every week</option><option value="biweekly">Every two weeks</option><option value="monthly">Every month</option></select></label>
          <label className="grid gap-1 text-sm">First future follow-up<input required type="date" className={control} value={rule.anchorDate} onChange={event=>update({anchorDate:event.target.value})}/></label>
          <label className="grid gap-1 text-sm">Local meeting time<input required type="time" className={control} value={rule.localTime} onChange={event=>update({localTime:event.target.value})}/></label>
          <label className="grid gap-1 text-sm">Meeting timezone<input required className={control} value={rule.timezone} placeholder="America/New_York" onChange={event=>update({timezone:event.target.value})}/></label>
          <label className="grid gap-1 text-sm">Future meetings to plan<input required type="number" min={1} max={12} className={control} value={rule.count} onChange={event=>update({count:Number(event.target.value)})}/></label>
          {rule.cadence==="monthly"&&<label className="grid gap-1 text-sm">Monthly pattern<select className={control} value={rule.monthlyMode} onChange={event=>update({monthlyMode:event.target.value as FollowupRule["monthlyMode"]})}><option value="weekday_position">Same weekday position</option><option value="day_of_month">Same date of month</option></select></label>}
        </fieldset>
        {rule.cadence==="monthly"&&<p className="mt-2 text-sm text-muted-foreground">{rule.monthlyMode==="weekday_position"?"Uses the first date’s weekday position, such as second Tuesday. If it is the last occurrence of that weekday, each meeting uses the last one in its month.":"Uses the first date’s day number. Shorter months use their last day; later months return to the original day number."}</p>}
        <p className="mt-3 text-sm text-muted-foreground">Past meetings stay unchanged. Individually moved meetings keep their dates and occupy their existing place in the plan.</p>
        <button className={`${button} mt-3`} type="submit" disabled={locked}>Preview schedule</button>
      </form>}
      {schedule&&schedule.status!=="ended"&&<div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={locked} onClick={()=>void preview({action:schedule.status==="paused"?"resume":"pause"})}>{schedule.status==="paused"?"Preview resume":"Preview pause"}</button><button className={button} disabled={locked} onClick={()=>void preview({action:"end"})}>Preview ending schedule</button></div>}
      {pending&&<div className="mt-5 rounded-lg border border-border p-4" aria-label="Schedule change preview">
        <h5 className="font-medium">Review changes</h5>
        <p className="mt-1 text-sm text-muted-foreground">{pending.preview.status==="ended"?"Ending cancels future draft dates and preserves history. An ended schedule cannot be resumed.":pending.preview.status==="paused"?"Future draft dates will be paused. No invitations will be sent.":"Saving updates planned dates only. No invitations will be sent."}</p>
        {pending.preview.issues.length>0&&<ul role="alert" className="mt-2 list-disc pl-5 text-sm text-destructive">{pending.preview.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
        <ul className="mt-3 divide-y divide-border text-sm">{pending.preview.changes.map(row=><li key={row.id??`new-${row.position}`} className="py-2"><span className="font-medium capitalize">{row.action}</span> · {format(row.startsAt,pending.preview.rule?.timezone)}{row.previousStartsAt&&row.previousStartsAt!==row.startsAt&&<span className="text-muted-foreground"> · Previously {format(row.previousStartsAt,schedule?.rule.timezone)}</span>}{row.exception&&" · Individual exception"}</li>)}</ul>
        {!pending.preview.changes.length&&<p className="mt-2 text-sm">No future dates will change.</p>}
        <div className="mt-3 flex gap-2"><button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={locked||!pending.preview.canApply} onClick={()=>void save()}>{busy?"Saving…":"Save reviewed changes"}</button><button className={button} disabled={busy} onClick={()=>setPending(null)}>Discard preview</button></div>
      </div>}
      {schedule&&<div className="mt-5"><h5 className="text-sm font-medium">Saved dates · {schedule.rule.timezone}</h5><ul className="mt-2 divide-y divide-border">{schedule.occurrences.map(row=><li key={row.id} className="py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p>{format(row.startsAt,schedule.rule.timezone)} <span className="text-muted-foreground">· {row.bookingId?`Booked · Invitation ${row.inviteStatus}`:row.status}{row.exception?" · Individually moved":""}{new Date(row.startsAt).getTime()<=Date.now()?" · Past or started":""}</span></p>
        {row.status!=="cancelled"&&new Date(row.startsAt).getTime()>Date.now()&&<button className={button} disabled={locked} onClick={()=>{setMoving(row.id);setMoveDate("");setMoveTime(schedule.rule.localTime);setPending(null);}}>Move this meeting</button>}</div>
        {moving===row.id&&<form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();void preview({action:"move",occurrenceId:row.id,date:moveDate,time:moveTime});}}><label className="grid gap-1">New date<input required type="date" className={control} value={moveDate} onChange={event=>{setMoveDate(event.target.value);setPending(null);}}/></label><label className="grid gap-1">New time<input required type="time" className={control} value={moveTime} onChange={event=>{setMoveTime(event.target.value);setPending(null);}}/></label><button className={button} disabled={locked}>Preview this move</button></form>}
      </li>)}</ul></div>}
    </>}
  </section>;
}

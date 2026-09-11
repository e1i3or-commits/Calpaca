import {useEffect,useRef,useState} from "react";
import {ApiError,getOnboardingScheduling,prepareOnboardingCalls,publishOnboardingKickoff,enableOnboardingFollowups,type EngagementDetail,type OnboardingScheduling} from "@/lib/api";
const button="min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50";
const primary="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50";
const messages:Record<string,string>={
  rollout_not_enabled:"Live onboarding scheduling is awaiting deployment checks.",
  mail_configuration_missing:"The invitation email service needs setup.",
  delivery_feedback_not_configured:"Email delivery tracking needs setup.",
  public_url_not_configured:"The booking address needs setup.",
  dispatcher_stale:"The invitation service has not reported a recent successful check.",
  scheduler_stale:"The cadence service has not reported a recent successful check.",
  feedback_stale:"Email delivery tracking has not reported a recent successful check.",
  engagement_closed:"Resume this Engagement before enabling scheduling.",
  calendar_setup_incomplete:"Complete the required team's calendar setup.",
  kickoff_configuration_changed:"Restore the agreed kickoff duration, organizer and required team.",
  followup_configuration_changed:"Restore the agreed follow-up duration, organizer and attendance.",
  automation_identity_unavailable:"Restore the automation account's active administrator membership.",
  kickoff_delivery_unverified:"Book the kickoff and verify its invitations before starting follow-ups.",
  followup_schedule_missing:"Save follow-up dates in the schedule below.",
  followup_schedule_not_planned:"Resume the saved follow-up schedule before starting calls.",
  followup_dates_invalid:"Review the follow-up dates so every planned call is in the future.",
  followups_before_kickoff:"Follow-up calls must start after the kickoff ends.",
  revision_conflict:"The plan changed. Refresh and review the current dates.",
  preview_changed:"The dates or kickoff changed. Refresh and review them again.",
  forbidden:"You do not have permission to change this scheduling setup.",
  blocked:"Scheduling cannot start yet. Refresh the checks and resolve the listed items.",
};
function explain(error:unknown) {
  return error instanceof ApiError?messages[error.code]??"The change could not be confirmed. Refresh to check the saved state before retrying.":"The change could not be confirmed. Check your connection and refresh.";
}
function Issues({items}:{items:string[]}) {
  const visible=items.filter(code=>!["kickoff_not_prepared","followup_not_prepared"].includes(code));
  return visible.length?<ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{visible.map(code=><li key={code}>{messages[code]??"Scheduling needs attention. Refresh the checks or contact the account lead."}</li>)}</ul>:null;
}
export function OnboardingSchedulingPanel({engagement,reload}:{engagement:EngagementDetail;reload:()=>Promise<void>}) {
  const [state,setState]=useState<OnboardingScheduling|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const [selectedKickoff,setSelectedKickoff]=useState("");
  const requests=useRef(new Map<string,string>());
  useEffect(()=>{
    let alive=true;
    getOnboardingScheduling(engagement.id).then(value=>{if(alive)setState(value);}).catch(error=>{if(alive)setError(explain(error));});
    return()=>{alive=false;};
  },[engagement.id,engagement.onboarding?.revision,engagement.status]);
  const kickoffId=selectedKickoff || (state?.followups.eligibleKickoffs.length===1?state.followups.eligibleKickoffs[0]!.id:"");
  async function refresh() {
    setBusy(true);setError(null);
    try {setState(await getOnboardingScheduling(engagement.id));}catch(error){setError(explain(error));}finally{setBusy(false);}
  }
  async function act(action:"prepare-kickoff"|"prepare-followups"|"publish"|"enable") {
    if(!state)return;
    setBusy(true);setError(null);setNotice(null);
    const key=`${action}:${state.revision}:${action==="enable"?`${kickoffId}:${state.followups.previewHash}`:""}`;
    const requestId=requests.current.get(key)??crypto.randomUUID();requests.current.set(key,requestId);
    try {
      if(action.startsWith("prepare-"))await prepareOnboardingCalls(engagement.id,action==="prepare-kickoff"?"kickoff":"followups");
      else if(action==="publish")await publishOnboardingKickoff(engagement.id,{revision:state.revision,requestId});
      else await enableOnboardingFollowups(engagement.id,{revision:state.revision,requestId,kickoffBookingId:kickoffId,previewHash:state.followups.previewHash});
      requests.current.delete(key);
      const [updated]=await Promise.all([getOnboardingScheduling(engagement.id),reload()]);setState(updated);
      setNotice(action==="publish"?"Kickoff booking is available.":action==="enable"?"Follow-up cadence started. Calls will be booked after availability checks; track invitation delivery in the schedule.":"Call setup saved.");
    }catch(error){setError(explain(error));}finally{setBusy(false);}
  }
  const format=(value:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:state?.followups.timezone??"UTC"}).format(new Date(value));
  return <section className="mt-6 rounded-lg border border-border p-4" aria-labelledby="onboarding-scheduling-title">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 id="onboarding-scheduling-title" className="font-medium">Booking and cadence</h4><button className={button} disabled={busy} onClick={()=>void refresh()}>Refresh scheduling checks</button></div>
    {error?<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>:null}
    {notice?<p role="status" className="mt-3 text-sm text-primary">{notice}</p>:null}
    {!state?<p role="status" className="mt-3 text-sm">{error?"Scheduling status is unavailable. Refresh to retry.":"Checking scheduling readiness…"}</p>:<>
      <div className="mt-4"><h5 className="text-sm font-medium">Kickoff booking</h5>
        {state.kickoff.kickoffBookingUrl?<a className="mt-2 inline-flex min-h-11 items-center text-sm text-primary" href={state.kickoff.kickoffBookingUrl} target="_blank" rel="noopener noreferrer">Open kickoff booking page</a>:state.kickoff.published?<p className="mt-2 text-sm text-muted-foreground">Kickoff booking is paused or needs attention.</p>:<p className="mt-2 text-sm text-muted-foreground">Enable booking when the team and invitation services are ready.</p>}
        {!state.kickoff.available?<Issues items={state.kickoff.issues}/>:null}
        {state.canPublish&&!state.kickoff.prepared?<button className={`${button} mt-3`} disabled={busy} onClick={()=>void act("prepare-kickoff")}>Set up kickoff call</button>:null}
        {state.canPublish&&state.kickoff.prepared&&!state.kickoff.published?<button className={`${primary} mt-3`} disabled={busy||state.kickoff.issues.length>0} onClick={()=>void act("publish")}>Enable kickoff booking</button>:null}
      </div>
      <div className="mt-5 border-t border-border pt-4"><h5 className="text-sm font-medium">Follow-up cadence</h5>
        {state.followups.enabled?<p role="status" className="mt-2 text-sm">Cadence enabled. Manage dates, pauses and invitation status in the follow-up schedule below.</p>:<>
          <p className="mt-2 text-sm text-muted-foreground">Review these dates with the franchisee before starting. Franchise Success attends every call; Kai and Andrew are optional.</p>
          <Issues items={state.followups.issues}/>
          {state.canPublish&&!state.followups.prepared?<button className={`${button} mt-3`} disabled={busy} onClick={()=>void act("prepare-followups")}>Set up follow-up calls</button>:null}
          {state.followups.eligibleKickoffs.length>0?<label className="mt-3 grid gap-1 text-sm">Kickoff for this cadence<select className="min-h-11 rounded-md border border-input bg-background px-3" value={kickoffId} disabled={busy||!state.canEnable} onChange={event=>setSelectedKickoff(event.target.value)}><option value="">Choose the confirmed kickoff</option>{state.followups.eligibleKickoffs.map(booking=><option key={booking.id} value={booking.id}>{format(booking.startsAt)}</option>)}</select></label>:null}
          {state.followups.dates.length>0?<div className="mt-3 text-sm"><p className="font-medium">Dates to start · {state.followups.timezone}</p><ol className="mt-2 list-decimal space-y-1 pl-5">{state.followups.dates.map(date=><li key={date.id}>{format(date.startsAt)} · 45 minutes</li>)}</ol></div>:null}
          {state.canEnable&&state.followups.prepared?<button className={`${primary} mt-4`} disabled={busy||state.followups.issues.length>0||!kickoffId} onClick={()=>void act("enable")}>Start follow-up calls</button>:null}
        </>}
      </div>
    </>}
  </section>;
}

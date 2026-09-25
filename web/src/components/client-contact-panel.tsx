import { useState } from "react";
import { ApiError, updateOnboardingClientContact, type EngagementDetail } from "@/lib/api";

const control = "min-h-11 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50";
const button = "min-h-11 rounded-lg border border-input px-4 text-sm disabled:opacity-50";
const sources = {
  kickoff: "From the kickoff booking",
  manual: "Set by the team",
  workspace: "Branded mailbox confirmed by IT",
};
const messages: Record<string,string> = {
  calendar_reconciliation_blocked: "Booked follow-ups could not be moved safely. The saved contact and invitations are unchanged. Resolve any outstanding invitation issue, then try again.",
  revision_conflict: "The plan changed. Refresh and try again.",
  engagement_closed: "This Engagement is closed. Its contact history is preserved.",
  forbidden: "Only the account lead or a workspace administrator can change the client contact.",
  invalid_input: "Enter a name and a valid email address.",
  request_conflict: "This save request has already been used. Refresh and try again.",
};

/** Who follow-ups invite. Saving moves booked future follow-ups to the new
 * person: the previous address receives a cancellation, the new one an invitation. */
export function ClientContactRow({engagement,reload}:{engagement:EngagementDetail;reload:()=>Promise<void>}) {
  const plan=engagement.onboarding, contact=plan?.clientContact??null;
  const [editing,setEditing]=useState(false), [busy,setBusy]=useState(false);
  const [name,setName]=useState(contact?.name??""), [email,setEmail]=useState(contact?.email??"");
  const [error,setError]=useState<string|null>(null), [notice,setNotice]=useState<string|null>(null);
  if(!plan)return null;
  async function save() {
    if(!plan)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      const result=await updateOnboardingClientContact(engagement.id,{revision:plan.revision,requestId:crypto.randomUUID(),name:name.trim(),email:email.trim()});
      const moved=result.updatedBookings??0;
      setNotice(result.kind==="unchanged"?"No change.":moved?`Saved. ${moved} booked follow-up${moved===1?"":"s"} will move to ${result.contact.email}; the previous address receives a cancellation.`:"Saved. Future follow-ups will invite this person.");
      setEditing(false);await reload();
    } catch(caught) {
      setError(caught instanceof ApiError?messages[caught.code]??"The change could not be confirmed. Refresh to check the saved contact; repeating the save will not duplicate invitations.":"The change could not be confirmed. Check your connection and refresh.");
    } finally {setBusy(false);}
  }
  return <>
    <dt className="text-muted-foreground">Client contact</dt>
    <dd>
      {contact?<p>{contact.name} · {contact.email} <span className="text-muted-foreground">· {sources[contact.source]}</span></p>
        :<p className="text-muted-foreground">Not known yet. The kickoff booking supplies it.</p>}
      <p className="mt-1 text-xs text-muted-foreground">Follow-up invitations go to this person. The kickoff keeps the address it was booked with.</p>
      {engagement.canManage&&!editing&&<button className="mt-2 min-h-11 text-sm text-primary" onClick={()=>{setName(contact?.name??"");setEmail(contact?.email??"");setEditing(true);setNotice(null);}}>Change contact</button>}
      {editing&&<div className="mt-3 grid gap-3 sm:max-w-md">
        <label className="grid gap-1 text-sm">Name<input className={control} value={name} autoComplete="off" onChange={event=>setName(event.target.value)}/></label>
        <label className="grid gap-1 text-sm">Email<input className={control} type="email" value={email} autoComplete="off" onChange={event=>setEmail(event.target.value)}/></label>
        <p className="text-xs text-muted-foreground">Booked future follow-ups move to this person. The previous address receives a cancellation. Times and meeting links stay the same.</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy||!name.trim()||!email.trim()} onClick={()=>void save()}>{busy?"Saving…":"Save contact"}</button>
          <button className={button} disabled={busy} onClick={()=>{setEditing(false);setError(null);}}>Cancel</button>
        </div>
      </div>}
      {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    </dd>
  </>;
}

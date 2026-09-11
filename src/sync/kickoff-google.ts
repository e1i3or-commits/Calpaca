import type { Delivery } from "../db/kickoff-delivery-repo";

export class KickoffProviderError extends Error {
  constructor(public readonly code:string,public readonly retryable=false){super(code);}
}
type Event = {
  id?:string;etag?:string;status?:string;organizer?:{email?:string};
  start?:{dateTime?:string};end?:{dateTime?:string};attendees?:{email?:string;optional?:boolean}[];
  extendedProperties?:{private?:Record<string,string>};
  conferenceData?:{createRequest?:{status?:{statusCode?:string}};entryPoints?:{entryPointType?:string;uri?:string}[]};
};

/** Stable resource ID + readback + conditional updates. A lost POST/PATCH
 * response is recovered by GET; it cannot create a second calendar event.
 * Docs: developers.google.com/workspace/calendar/api/guides/version-resources */
export async function syncKickoffGoogle(delivery:Delivery,calendarId:string,accessToken:string,request:typeof fetch=fetch) {
  const ctx=delivery.snapshot,booking=ctx.booking,organizer=ctx.hosts[0];
  if(!organizer)throw new KickoffProviderError("organizer_missing");
  const expectedOrganizer=(calendarId==="primary"?organizer.email:calendarId).toLowerCase();
  const attendees=[{email:booking.inviteeEmail,displayName:booking.inviteeName,optional:false},...ctx.hosts.filter(host=>host.email.toLowerCase()!==expectedOrganizer).map(host=>({email:host.email,displayName:host.name,optional:host.role==="optional"})),...(booking.guestEmails??[]).map(email=>({email,optional:false}))]
    .filter((person,index,all)=>all.findIndex(other=>other.email.toLowerCase()===person.email.toLowerCase())===index);
  const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const url=`${base}/${encodeURIComponent(delivery.googleEventId)}`;
  const headers={authorization:`Bearer ${accessToken}`,"content-type":"application/json"};
  async function call(target:string,options:RequestInit={}) {
    let response:Response;
    try {response=await request(target,{...options,headers:{...headers,...options.headers},redirect:"error",signal:AbortSignal.timeout(20_000)});}
    catch {throw new KickoffProviderError("calendar_outcome_unknown",true);}
    if(!response.ok && ![404,410,409,412].includes(response.status))throw new KickoffProviderError(`calendar_http_${response.status}`,response.status===429||response.status>=500);
    return response;
  }
  async function read():Promise<Event|null> {
    const response=await call(url);
    if([404,410].includes(response.status))return null;
    if(!response.ok)throw new KickoffProviderError("calendar_read_failed",true);
    try {return await response.json() as Event;}catch{throw new KickoffProviderError("calendar_readback_invalid",true);}
  }
  const needsMeet=booking.bookingLocation?.type==="google_meet"||(!booking.bookingLocation&&booking.meetingFormat==="google_meet");
  function matches(event:Event,requireOperation=true) {
    const expected=new Set(attendees.map(person=>person.email.toLowerCase()));
    const actual=(event.attendees??[]).filter(person=>person.email?.toLowerCase()!==expectedOrganizer);
    expected.delete(expectedOrganizer);
    return event.id===delivery.googleEventId && event.status!=="cancelled"
      && event.organizer?.email?.toLowerCase()===expectedOrganizer
      && new Date(event.start?.dateTime??"").getTime()===new Date(booking.startsAt).getTime()
      && new Date(event.end?.dateTime??"").getTime()===new Date(booking.endsAt).getTime()
      && actual.length===expected.size && new Set(actual.map(person=>person.email?.toLowerCase())).size===expected.size
      && actual.every(person=>person.email&&expected.has(person.email.toLowerCase())&&!!person.optional===attendees.find(host=>host.email.toLowerCase()===person.email!.toLowerCase())?.optional)
      && event.extendedProperties?.private?.tourscaleBookingId===booking.id
      && (!requireOperation||event.extendedProperties?.private?.tourscaleDeliveryId===delivery.id)
      && (!needsMeet||event.conferenceData?.entryPoints?.some(point=>point.entryPointType==="video"&&point.uri?.startsWith("https://meet.google.com/")));
  }
  const existing=await read();
  if(delivery.kind==="cancelled") {
    if(!existing||existing.status==="cancelled")return;
    if(existing.extendedProperties?.private?.tourscaleBookingId!==booking.id||!existing.etag)throw new KickoffProviderError("calendar_identity_conflict");
    const response=await call(`${url}?sendUpdates=all`,{method:"DELETE",headers:{"If-Match":existing.etag}});
    if(response.status===412)throw new KickoffProviderError("calendar_version_changed",true);
    const after=await read();if(after&&after.status!=="cancelled")throw new KickoffProviderError("calendar_delete_unverified",true);return;
  }
  if(delivery.kind==="reminder") {
    if(!existing||!matches(existing,false))throw new KickoffProviderError("reminder_calendar_unverified");return;
  }
  if(existing&&matches(existing))return;
  if(existing?.extendedProperties?.private?.tourscaleDeliveryId===delivery.id) {
    // A conference may still be provisioning. Never resend the native invite
    // just because its Meet link has not appeared in readback yet.
    throw new KickoffProviderError("calendar_readback_incomplete",true);
  }
  if(existing&&(existing.extendedProperties?.private?.tourscaleBookingId!==booking.id||!existing.etag
    ||Number(existing.extendedProperties?.private?.tourscaleSequence??0)>delivery.sequence))throw new KickoffProviderError("calendar_identity_conflict");
  if(!existing&&delivery.kind!=="created")throw new KickoffProviderError("calendar_event_missing");
  const body={summary:`${ctx.eventTypeTitle}: ${organizer.name} and ${booking.inviteeName}`,
    start:{dateTime:booking.startsAt},end:{dateTime:booking.endsAt},attendees,
    extendedProperties:{private:{tourscaleBookingId:booking.id,tourscaleDeliveryId:delivery.id,tourscaleSequence:String(delivery.sequence)}},
    ...(!existing?{id:delivery.googleEventId}:{}),
    ...(!existing&&needsMeet?{conferenceData:{createRequest:{requestId:delivery.googleEventId,conferenceSolutionKey:{type:"hangoutsMeet"}}}}:{}),
  };
  const response=await call(`${existing?url:base}?sendUpdates=all&conferenceDataVersion=1`,{method:existing?"PATCH":"POST",headers:existing?{"If-Match":existing.etag!}:{},body:JSON.stringify(body)});
  if(response.status===412)throw new KickoffProviderError("calendar_version_changed",true);
  const after=await read();
  if(!after||!matches(after))throw new KickoffProviderError("calendar_write_unverified",true);
}

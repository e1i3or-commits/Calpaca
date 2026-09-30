/** The "Notes by Gemini" document attached to a meeting's calendar event, if
 * any. Reads only the event's attachment list with the organizer's existing
 * calendar access; the document itself is read elsewhere. */
export type MeetingNotesFile = { fileId: string; title: string; url: string };
export class MeetingNotesLookupError extends Error { constructor(readonly code: string) { super(code); } }

export async function findGeminiNotes(calendarId: string, eventId: string, accessToken: string, request: typeof fetch = fetch): Promise<MeetingNotesFile | null> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?fields=status,attachments(fileId,fileUrl,title,mimeType)`;
  let response: Response;
  try { response = await request(url, { headers: { authorization: `Bearer ${accessToken}` }, redirect: "error", signal: AbortSignal.timeout(15_000) }); }
  catch { throw new MeetingNotesLookupError("calendar_unreachable"); }
  if ([404, 410].includes(response.status)) return null;
  if (!response.ok) throw new MeetingNotesLookupError(`calendar_http_${response.status}`);
  const event = await response.json().catch(() => null) as { attachments?: { fileId?: string; fileUrl?: string; title?: string; mimeType?: string }[] } | null;
  if (!event) throw new MeetingNotesLookupError("calendar_readback_invalid");
  const notes = (event.attachments ?? []).filter((a) => a.mimeType === "application/vnd.google-apps.document" && /Notes by Gemini/i.test(a.title ?? "")
    && typeof a.fileId === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(a.fileId));
  // Several notes documents on one event would be ambiguous; take the one Google lists last (the newest).
  const chosen = notes.at(-1);
  return chosen ? { fileId: chosen.fileId!, title: (chosen.title ?? "").slice(0, 300), url: `https://docs.google.com/document/d/${chosen.fileId}` } : null;
}

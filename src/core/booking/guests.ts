import { err, ok, type Result } from "../../lib/result";

/**
 * A public booking form fans out one email and one calendar invite per guest,
 * so the ceiling lives here rather than as a per-event-type column: an
 * unbounded list is a deliverability risk on the sending domain, and one
 * tested constant costs less than a column, a Zod field, a form input, and a
 * number every organizer has to decide.
 */
export const MAX_GUESTS = 10;

export type GuestListError =
  | { readonly kind: "too_many"; readonly max: number }
  | { readonly kind: "invalid_email"; readonly value: string };

// Deliberately conservative rather than RFC-complete: one @, no whitespace,
// and a dotted domain. This only keeps obvious junk out of an address handed
// to Google and to the mail transport; those two are the real validators.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// Shared by both entry points: the invitee and hosts are already attendees on
// the event, so either list would land twice on the calendar invite.
function alreadyAttendingSet(inviteeEmail: string, hostEmails: readonly string[]): Set<string> {
  return new Set(
    [inviteeEmail, ...hostEmails].map((address) => address.trim().toLowerCase()),
  );
}

/**
 * Normalizes an invitee-supplied guest list into the exact addresses to invite.
 *
 * Excludes the invitee and the hosts because they are already attendees, so a
 * repeat would land twice on the Google event. Blank entries are skipped rather
 * than rejected: the booking form leaves empty inputs behind, and failing the
 * whole booking over one is hostile.
 */
export function parseGuestEmails(
  raw: readonly string[],
  inviteeEmail: string,
  hostEmails: readonly string[],
): Result<string[], GuestListError> {
  const alreadyAttending = alreadyAttendingSet(inviteeEmail, hostEmails);
  const seen = new Set<string>();
  const guests: string[] = [];

  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) return err({ kind: "invalid_email", value: entry });
    if (alreadyAttending.has(email) || seen.has(email)) continue;
    seen.add(email);
    guests.push(email);
  }

  // Counted after de-duplication so a pasted duplicate does not spend a slot.
  if (guests.length > MAX_GUESTS) return err({ kind: "too_many", max: MAX_GUESTS });
  return ok(guests);
}

/**
 * Filters an already-stored guest list at send time.
 *
 * The booking route cannot exclude hosts, because host email addresses are not
 * in its scope and fetching them would add a query to the booking hot path. The
 * send path has them, and running the check there also covers a host added to
 * the event type after the booking was made — inviting them as a guest would
 * duplicate them on the calendar event.
 */
export function guestsToInvite(
  stored: readonly string[],
  inviteeEmail: string,
  hostEmails: readonly string[],
): string[] {
  const alreadyAttending = alreadyAttendingSet(inviteeEmail, hostEmails);
  return stored.filter((email) => !alreadyAttending.has(email.trim().toLowerCase()));
}

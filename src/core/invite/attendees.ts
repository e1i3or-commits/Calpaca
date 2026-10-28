export interface BookingAttendee {
  readonly name: string;
  readonly email: string;
  readonly role?: "required" | "optional";
}

/** Event ownership is separate from attendance. Every booked host, including
 * the organizer, participates; a secondary organizing calendar is not itself
 * a participant. Keep one entry per address across invitee, hosts and guests. */
export function buildBookingAttendees(
  invitee: BookingAttendee,
  hosts: readonly BookingAttendee[],
  guestEmails: readonly string[] = [],
): BookingAttendee[] {
  const seen = new Set<string>();
  return [invitee, ...hosts, ...guestEmails.map((email) => ({ name: email, email }))]
    .filter((person) => {
      const email = person.email.trim().toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

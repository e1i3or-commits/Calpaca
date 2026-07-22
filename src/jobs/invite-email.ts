import { Temporal } from "@js-temporal/polyfill";
import { buildIcs } from "../core/invite/ics";
import { composeInviteEmail, type InviteKind } from "../core/invite/email";
import { appendEvent, getInviteContext, type InviteContext } from "../db/booking-repo";
import { isMailerConfigured, sendInviteMail } from "../notifications/mailer";

/**
 * The invite-email job body. Sends ONE email per lifecycle change with the
 * invitee in To and every host in Cc — sync never writes to Google
 * calendars, so hosts need the ICS as much as invitees do.
 *
 * Event-log semantics (src/core/booking/state.ts): invite_sent records the
 * SMTP handoff for created/rescheduled invites; cancellation notices append
 * nothing (invite events are illegal on a cancelled booking, by design).
 * invite_failed models a post-send bounce, so a send that throws here simply
 * retries via pg-boss and the invite status stays "none" — visibly unsent.
 */

/** One reminder, 24h before start. The sweep query and the send-time guard
 * both measure against this same lead. */
export const REMINDER_LEAD = Temporal.Duration.from({ hours: 24 });

function buildLinks(bookingId: string, rescheduleToken: string, cancelToken: string) {
  const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return null;
  return {
    reschedule: `${base}/reschedule/${bookingId}?token=${rescheduleToken}`,
    cancel: `${base}/cancel/${bookingId}?token=${cancelToken}`,
  };
}

export async function sendInvite(bookingId: string, kind: InviteKind): Promise<void> {
  if (!isMailerConfigured()) {
    console.log(`[jobs] invite ${kind} for ${bookingId} skipped: SMTP not configured`);
    return;
  }

  const ctx = await getInviteContext(bookingId);
  if (!ctx) {
    console.error(`[jobs] invite for ${bookingId}: booking or event type missing`);
    return;
  }

  const mail = buildMail(ctx, kind, Temporal.Now.instant());
  const result = await sendInviteMail(mail);

  if (kind !== "cancelled") {
    const recorded = await appendEvent(bookingId, "invite_sent", {});
    if (!recorded.ok) {
      // e.g. cancelled between send and record — log, never retry the email
      console.error(`[jobs] invite_sent for ${bookingId} not recorded:`, recorded.error);
    }
    await recordInviteeRejection(bookingId, mail.to, result.rejected);
  }
  console.log(`[jobs] invite ${kind} for ${bookingId} sent`);
}

/** The SMTP server refusing the invitee's address at handoff is a real
 * delivery-failure signal (retrying would refuse the same way), so it is
 * recorded as invite_failed. A refusal on a host's cc is only logged: the
 * invitee-facing invite status should not flip on a host mailbox problem.
 * Exported for the projection integration test. */
export async function recordInviteeRejection(
  bookingId: string,
  inviteeEmail: string,
  rejected: readonly string[],
  executor?: Parameters<typeof appendEvent>[3],
): Promise<void> {
  if (rejected.length === 0) return;
  const inviteeHit = rejected.some((r) => r.toLowerCase() === inviteeEmail.toLowerCase());
  if (!inviteeHit) {
    console.warn(`[jobs] invite for ${bookingId}: cc rejected (${rejected.join(", ")})`);
    return;
  }
  const recorded = await appendEvent(
    bookingId,
    "invite_failed",
    { reason: "recipient_rejected" },
    executor,
  );
  if (!recorded.ok) {
    console.error(`[jobs] invite_failed for ${bookingId} not recorded:`, recorded.error);
  } else {
    console.warn(`[jobs] invite for ${bookingId}: invitee address rejected at SMTP handoff`);
  }
}

/**
 * The reminder-sweep job body. Re-checks the window at send time: between
 * enqueue and send the booking may have been cancelled or moved, and a skip
 * here appends nothing, so a rescheduled booking's reminder re-arms on the
 * next sweep instead of firing at the wrong time.
 */
export async function sendReminder(bookingId: string): Promise<void> {
  if (!isMailerConfigured()) {
    console.log(`[jobs] reminder for ${bookingId} skipped: SMTP not configured`);
    return;
  }

  const ctx = await getInviteContext(bookingId);
  if (!ctx) {
    console.error(`[jobs] reminder for ${bookingId}: booking or event type missing`);
    return;
  }

  const now = Temporal.Now.instant();
  const { startsAt } = ctx.booking;
  if (
    ctx.booking.status !== "confirmed" ||
    Temporal.Instant.compare(startsAt, now) <= 0 ||
    Temporal.Instant.compare(startsAt, now.add(REMINDER_LEAD)) > 0
  ) {
    console.log(`[jobs] reminder for ${bookingId} skipped: no longer due`);
    return;
  }

  const mail = buildMail(ctx, "reminder", now);
  const result = await sendInviteMail(mail);

  const recorded = await appendEvent(bookingId, "reminder_sent", {});
  if (!recorded.ok) {
    // e.g. cancelled between send and record — log; the log stays authoritative
    console.error(`[jobs] reminder_sent for ${bookingId} not recorded:`, recorded.error);
  }
  // a refused invitee address is the same signal whichever mail surfaced it
  await recordInviteeRejection(bookingId, mail.to, result.rejected);
  console.log(`[jobs] reminder for ${bookingId} sent`);
}

/** Split out so the live SMTP test can exercise composition + transport
 * without a pg-boss round trip. */
export function buildMail(ctx: InviteContext, kind: InviteKind, now: Temporal.Instant) {
  const { booking, hosts } = ctx;
  const [organizer] = hosts;
  if (!organizer) throw new Error(`booking ${booking.id} has no hosts`);

  const email = composeInviteEmail({
    kind,
    eventTitle: ctx.eventTypeTitle,
    inviteeName: booking.inviteeName,
    hostName: organizer.name,
    start: booking.startsAt,
    end: booking.endsAt,
    timezone: booking.inviteeTimezone,
    links: kind === "cancelled" ? null : buildLinks(booking.id, booking.rescheduleToken, booking.cancelToken),
  });

  const ics = buildIcs({
    method: kind === "cancelled" ? "CANCEL" : "REQUEST",
    uid: `${booking.id}@scheduling-platform`,
    sequence: ctx.rescheduleCount,
    dtStamp: now,
    start: booking.startsAt,
    end: booking.endsAt,
    summary: `${ctx.eventTypeTitle}: ${organizer.name} and ${booking.inviteeName}`,
    organizer: { name: organizer.name, email: organizer.email },
    attendees: [
      { name: booking.inviteeName, email: booking.inviteeEmail },
      ...hosts.slice(1).map((h) => ({ name: h.name, email: h.email })),
    ],
  });

  return {
    to: booking.inviteeEmail,
    cc: hosts.map((h) => h.email),
    subject: email.subject,
    text: email.text,
    // unique per send, booking id parseable from it: providers echo the
    // original Message-ID in bounce/delivery notifications, which is how an
    // n8n flow correlates them back to POST /api/webhooks/email-delivery
    messageId: `<${crypto.randomUUID()}.${booking.id}@scheduling-platform>`,
    ics: { method: kind === "cancelled" ? ("CANCEL" as const) : ("REQUEST" as const), content: ics },
  };
}

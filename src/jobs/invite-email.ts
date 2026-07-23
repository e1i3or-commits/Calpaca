import { Temporal } from "@js-temporal/polyfill";
import { getAuth } from "../auth/index";
import { buildIcs } from "../core/invite/ics";
import { composeInviteEmail, type InviteKind } from "../core/invite/email";
import {
  appendEvent,
  getInviteContext,
  setGoogleEventId,
  type InviteContext,
} from "../db/booking-repo";
import { getWritableConnectionForUser } from "../db/sync-repo";
import { deleteEvent, insertEvent, patchEventTime } from "../sync/google";
import { isMailerConfigured, sendInviteMail } from "../notifications/mailer";

/** Lazy import avoids an initialization cycle: jobs/index owns pg-boss and
 * imports this module to register the invite worker. */
async function emitRecordedEvent(
  bookingId: string,
  kind: "invite_sent" | "invite_failed" | "reminder_sent",
): Promise<void> {
  const { emitBookingWebhook } = await import("./index");
  await emitBookingWebhook(bookingId, kind);
}

/**
 * The invite-email job body. Best-effort write-through to the organizer
 * host's Google calendar happens first (Google then sends native invites via
 * sendUpdates=all — Gmail refuses to render third-party iTIP whose From does
 * not match the ORGANIZER); the email follows with reschedule/cancel links,
 * attaching the ICS only when no Google event exists so non-Google hosts and
 * outage windows keep a calendar artifact. Invitee in To, every host in Cc.
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

function emailLogoUrl(ctx: InviteContext): string | null {
  const configured = ctx.eventTypeLogoUrl;
  if (configured?.startsWith("https://") || configured?.startsWith("http://")) return configured;
  const path = configured ?? (ctx.eventTypeTheme === "tourscale" ? "/brand/tourscale-logo-color.svg" : null);
  const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
  return path && base ? `${base}${path.startsWith("/") ? "" : "/"}${path}` : null;
}

function preparationText(ctx: InviteContext): string {
  const answerLines = Object.entries(ctx.booking.bookingAnswers ?? {}).map(([id, value]) => {
    const label = ctx.bookingQuestions?.find((question) => question.id === id)?.label ?? id;
    const rendered = Array.isArray(value)
      ? value.join(", ")
      : typeof value === "boolean" ? (value ? "Yes" : "No") : value;
    return `${label}: ${rendered}`;
  });
  return [
    ...(ctx.booking.inviteeNotes ? [ctx.booking.inviteeNotes] : []),
    ...(answerLines.length ? ["Booking answers:", ...answerLines] : []),
  ].join("\n\n");
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

  const hasGoogleEvent = await syncGoogleEvent(ctx, kind);
  const mail = buildMail(ctx, kind, Temporal.Now.instant(), { includeIcs: !hasGoogleEvent });
  const result = await sendInviteMail(mail);

  if (kind !== "cancelled") {
    const recorded = await appendEvent(bookingId, "invite_sent", {});
    if (!recorded.ok) {
      // e.g. cancelled between send and record — log, never retry the email
      console.error(`[jobs] invite_sent for ${bookingId} not recorded:`, recorded.error);
    } else {
      await emitRecordedEvent(bookingId, "invite_sent");
    }
    await recordInviteeRejection(bookingId, mail.to, result.rejected);
  }
  console.log(`[jobs] invite ${kind} for ${bookingId} sent`);
}

/**
 * Best-effort write-through to the organizer host's Google calendar. Returns
 * whether a Google event exists for the booking after this call — the email
 * attaches the ICS only when it does not. Never throws: a Google outage must
 * not block the confirmation email, and the ICS fallback keeps a calendar
 * artifact in that window. Retries of the job are safe: the event id is
 * persisted before the email is sent, so a retry sees it and skips insert.
 */
async function syncGoogleEvent(ctx: InviteContext, kind: InviteKind): Promise<boolean> {
  const { booking, hosts } = ctx;
  const [organizer] = hosts;
  if (!organizer) return false;
  const existingId = booking.googleEventId ?? null;
  if (kind === "reminder") return existingId !== null;

  try {
    const conn = await getWritableConnectionForUser(organizer.id);
    if (!conn) return false;
    const token = await getAuth().api.getAccessToken({
      body: { providerId: "google", userId: organizer.id },
    });
    const accessToken = token.accessToken;
    if (!accessToken) return existingId !== null;
    const calendarId = conn.externalCalendarId;

    if (kind === "cancelled") {
      if (!existingId) return false;
      const r = await deleteEvent({ accessToken, calendarId, eventId: existingId });
      if (!r.ok) {
        console.error(`[jobs] google event delete for ${booking.id} failed: ${r.error.message}`);
        return false; // fall back to the iTIP CANCEL attachment
      }
      return true;
    }

    const startIso = booking.startsAt.toString({ smallestUnit: "second" });
    const endIso = booking.endsAt.toString({ smallestUnit: "second" });

    if (existingId) {
      if (kind !== "rescheduled") return true;
      const r = await patchEventTime({ accessToken, calendarId, eventId: existingId, startIso, endIso });
      if (!r.ok) {
        console.error(`[jobs] google event patch for ${booking.id} failed: ${r.error.message}`);
        return false; // ICS REQUEST with bumped SEQUENCE covers the move
      }
      return true;
    }

    const links = buildLinks(booking.id, booking.rescheduleToken, booking.cancelToken);
    const preparation = preparationText(ctx);
    const descriptionParts = [
      ...(preparation ? [`Details from ${booking.inviteeName}:\n${preparation}`] : []),
      ...(links ? [`Reschedule: ${links.reschedule}\nCancel: ${links.cancel}`] : []),
    ];
    const r = await insertEvent({
      accessToken,
      calendarId,
      event: {
        summary: `${ctx.eventTypeTitle}: ${organizer.name} and ${booking.inviteeName}`,
        description: descriptionParts.length ? descriptionParts.join("\n\n") : undefined,
        ...(booking.meetingFormat === "phone" && booking.inviteePhone
          ? { location: `Phone: ${booking.inviteePhone}` }
          : {}),
        createGoogleMeet: booking.meetingFormat === "google_meet",
        startIso,
        endIso,
        attendees: [
          { email: booking.inviteeEmail, displayName: booking.inviteeName },
          ...hosts.slice(1).map((h) => ({ email: h.email, displayName: h.name })),
        ],
      },
    });
    if (!r.ok) {
      console.error(`[jobs] google event insert for ${booking.id} failed: ${r.error.message}`);
      return false;
    }
    await setGoogleEventId(booking.id, r.value.eventId);
    console.log(`[jobs] google event created for ${booking.id}`);
    return true;
  } catch (e) {
    console.error(`[jobs] google event write for ${booking.id} failed:`, e);
    return existingId !== null;
  }
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
    if (!executor) await emitRecordedEvent(bookingId, "invite_failed");
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

  // no Google write for reminders — the event (if any) already exists
  const mail = buildMail(ctx, "reminder", now, { includeIcs: !ctx.booking.googleEventId });
  const result = await sendInviteMail(mail);

  const recorded = await appendEvent(bookingId, "reminder_sent", {});
  if (!recorded.ok) {
    // e.g. cancelled between send and record — log; the log stays authoritative
    console.error(`[jobs] reminder_sent for ${bookingId} not recorded:`, recorded.error);
  } else {
    await emitRecordedEvent(bookingId, "reminder_sent");
  }
  // a refused invitee address is the same signal whichever mail surfaced it
  await recordInviteeRejection(bookingId, mail.to, result.rejected);
  console.log(`[jobs] reminder for ${bookingId} sent`);
}

/** Split out so the live SMTP test can exercise composition + transport
 * without a pg-boss round trip. */
export function buildMail(
  ctx: InviteContext,
  kind: InviteKind,
  now: Temporal.Instant,
  opts?: { includeIcs?: boolean },
) {
  const includeIcs = opts?.includeIcs ?? true;
  const { booking, hosts } = ctx;
  const [organizer] = hosts;
  if (!organizer) throw new Error(`booking ${booking.id} has no hosts`);
  const preparation = preparationText(ctx);

  const email = composeInviteEmail({
    kind,
    eventTitle: ctx.eventTypeTitle,
    inviteeName: booking.inviteeName,
    hostName: organizer.name,
    start: booking.startsAt,
    end: booking.endsAt,
    timezone: booking.inviteeTimezone,
    links: kind === "cancelled" ? null : buildLinks(booking.id, booking.rescheduleToken, booking.cancelToken),
    icsAttached: includeIcs,
    notes: preparation || null,
    theme: ctx.eventTypeTheme,
    brandLogoUrl: emailLogoUrl(ctx),
  });

  const ics = includeIcs
    ? buildIcs({
        method: kind === "cancelled" ? "CANCEL" : "REQUEST",
        uid: `${booking.id}@scheduling-platform`,
        sequence: ctx.rescheduleCount,
        dtStamp: now,
        start: booking.startsAt,
        end: booking.endsAt,
        summary: `${ctx.eventTypeTitle}: ${organizer.name} and ${booking.inviteeName}`,
        ...(preparation
          ? { description: `Details from ${booking.inviteeName}:\n${preparation}` }
          : {}),
        organizer: { name: organizer.name, email: organizer.email },
        attendees: [
          { name: booking.inviteeName, email: booking.inviteeEmail },
          ...hosts.slice(1).map((h) => ({ name: h.name, email: h.email })),
        ],
      })
    : null;

  return {
    to: booking.inviteeEmail,
    cc: hosts.map((h) => h.email),
    subject: email.subject,
    text: email.text,
    html: email.html,
    // unique per send, booking id parseable from it: providers echo the
    // original Message-ID in bounce/delivery notifications, which is how an
    // n8n flow correlates them back to POST /api/webhooks/email-delivery
    messageId: `<${crypto.randomUUID()}.${booking.id}@scheduling-platform>`,
    ...(ics
      ? { ics: { method: kind === "cancelled" ? ("CANCEL" as const) : ("REQUEST" as const), content: ics } }
      : {}),
  };
}

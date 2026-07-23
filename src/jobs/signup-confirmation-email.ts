import {
  getSignupConfirmationContext,
  recordSignupConfirmation,
} from "../db/signup-sheet-repo";
import { isMailerConfigured, sendInviteMail } from "../notifications/mailer";
import { Temporal } from "@js-temporal/polyfill";
import { buildIcs } from "../core/invite/ics";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendSignupConfirmation(registrationIds: string[]): Promise<void> {
  if (!isMailerConfigured()) return;
  const context = await getSignupConfirmationContext(registrationIds);
  if (!context) return;
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: context.timezone,
  });
  const cancelUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/signup/cancel/${context.cancelToken}`
    : null;
  const from = process.env.EMAIL_FROM ?? "";
  const organizerEmail = from.match(/<([^>]+)>/)?.[1] ?? from;
  for (const session of context.sessions) {
    const when = `${formatter.format(session.startsAt)}–${new Intl.DateTimeFormat("en-US", {
      timeStyle: "short",
      timeZone: context.timezone,
    }).format(session.endsAt)}`;
    const text = [
      `Hi ${context.name},`,
      "",
      `You're registered for ${context.sheetTitle}.`,
      "",
      `${session.title}: ${when}`,
      ...(cancelUrl ? ["", `Cancel registration: ${cancelUrl}`] : []),
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f7f4ef;color:#29241f;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #ded6ca;border-radius:16px;padding:28px"><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(context.sheetTitle)}</h1><p>Hi ${escapeHtml(context.name)}, you're registered.</p><p><strong>${escapeHtml(session.title)}</strong><br>${escapeHtml(when)}</p>${cancelUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(cancelUrl)}" style="color:#19724d">Cancel registration</a></p>` : ""}</div></div></body></html>`;
    try {
      const result = await sendInviteMail({
        to: context.email,
        subject: `Registered: ${session.title}`,
        text,
        html,
        messageId: `<${session.id}.signup@calpaca>`,
        ics: {
          method: "REQUEST",
          content: buildIcs({
            method: "REQUEST",
            uid: `signup-${session.id}@calpaca`,
            sequence: 0,
            dtStamp: Temporal.Now.instant(),
            start: Temporal.Instant.fromEpochMilliseconds(session.startsAt.getTime()),
            end: Temporal.Instant.fromEpochMilliseconds(session.endsAt.getTime()),
            summary: `${context.sheetTitle}: ${session.title}`,
            organizer: { name: "Calpaca", email: organizerEmail },
            attendees: [{ name: context.name, email: context.email }],
          }),
        },
      });
      const rejected = result.rejected.some(
        (address) => address.toLowerCase() === context.email.toLowerCase(),
      );
      await recordSignupConfirmation(
        [session.id],
        rejected ? { sent: false, error: "recipient_rejected" } : { sent: true },
      );
    } catch (error) {
      await recordSignupConfirmation([session.id], {
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

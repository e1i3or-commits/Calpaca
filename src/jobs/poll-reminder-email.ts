import {
  getPollInviteContext,
  recordPollInviteDelivery,
  type PollInviteKind,
} from "../db/poll-repo";
import { isMailerConfigured, sendInviteMail } from "../notifications/mailer";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPollInviteOrReminder(
  inviteId: string,
  kind: PollInviteKind,
): Promise<void> {
  if (!isMailerConfigured()) return;
  const ctx = await getPollInviteContext(inviteId, kind);
  if (!ctx) return;
  const pollUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/poll/${ctx.publicId}`
    : null;
  if (!pollUrl) return;
  const reminder = kind !== "invitation";
  const lead = kind === "reminder_1h" ? "one hour" : "24 hours";
  const deadline = ctx.deadline
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: ctx.timezone,
      }).format(ctx.deadline)
    : null;
  const subject = reminder
    ? `Reminder: respond to ${ctx.title}`
    : `You're invited: ${ctx.title}`;
  const opening = reminder
    ? `Voting closes in ${lead}. Add your availability before the deadline.`
    : "You've been invited to share your availability.";
  const text = [
    opening,
    "",
    ctx.title,
    ...(deadline ? [`Deadline: ${deadline} (${ctx.timezone})`] : []),
    "",
    `Respond: ${pollUrl}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f4ef;color:#29241f;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #ded6ca;border-radius:16px;padding:28px"><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(ctx.title)}</h1><p>${escapeHtml(opening)}</p>${deadline ? `<p style="color:#6c6258"><strong>Deadline:</strong> ${escapeHtml(deadline)} (${escapeHtml(ctx.timezone)})</p>` : ""}<p style="margin-top:24px"><a href="${escapeHtml(pollUrl)}" style="display:inline-block;background:#19724d;color:#fff;text-decoration:none;border-radius:9px;padding:11px 18px;font-weight:600">Share availability</a></p></div></div></body></html>`;
  try {
    const result = await sendInviteMail({
      to: ctx.email,
      subject,
      text,
      html,
      messageId: `<${crypto.randomUUID()}.${ctx.inviteId}@calpaca>`,
    });
    const rejected = result.rejected.some(
      (address) => address.toLowerCase() === ctx.email.toLowerCase(),
    );
    await recordPollInviteDelivery(
      inviteId,
      kind,
      rejected ? { sent: false, error: "recipient_rejected" } : { sent: true },
    );
  } catch (error) {
    await recordPollInviteDelivery(inviteId, kind, {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

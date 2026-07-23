import { Temporal } from "@js-temporal/polyfill";
import { buildIcs } from "../core/invite/ics";
import {
  getPollFinalizationContext,
  recordPollFinalizationDelivery,
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

function renderedTime(start: Temporal.Instant, end: Temporal.Instant, timezone: string): string {
  const localStart = start.toZonedDateTimeISO(timezone);
  const localEnd = end.toZonedDateTimeISO(timezone);
  return `${localStart.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} – ${localEnd.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })} (${timezone})`;
}

export async function sendPollFinalization(
  pollId: string,
  participantId?: string,
): Promise<void> {
  if (!isMailerConfigured()) {
    console.log(`[jobs] poll finalization for ${pollId} skipped: SMTP not configured`);
    return;
  }
  const ctx = await getPollFinalizationContext(pollId);
  if (!ctx) return;
  const start = Temporal.Instant.fromEpochMilliseconds(ctx.option.startsAt.getTime());
  const end = Temporal.Instant.fromEpochMilliseconds(ctx.option.endsAt.getTime());
  const when = renderedTime(start, end, ctx.poll.timezone);
  const resultsUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/poll/${ctx.poll.publicId}`
    : null;

  for (const participant of ctx.participants) {
    if (participantId && participant.id !== participantId) continue;
    if (!participantId && participant.status === "sent") continue;
    const attending = participant.choice !== "no";
    const subject = attending
      ? `Final time: ${ctx.poll.title}`
      : `Poll finalized: ${ctx.poll.title}`;
    const attendanceCopy = attending
      ? "You marked this time as available. A calendar invitation is attached."
      : "You marked this time as unavailable, so no calendar invitation was attached.";
    const text = [
      `Hi ${participant.name},`,
      "",
      `${ctx.poll.title} has been finalized.`,
      "",
      when,
      "",
      attendanceCopy,
      ...(resultsUrl ? ["", `View results: ${resultsUrl}`] : []),
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f7f4ef;color:#29241f;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #ded6ca;border-radius:16px;padding:28px"><p style="margin:0 0 18px">Hi ${escapeHtml(participant.name)},</p><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(ctx.poll.title)} has been finalized</h1><div style="margin:20px 0;padding:16px;border-left:4px solid #19724d;background:#f2f7f4"><strong>${escapeHtml(when)}</strong></div><p>${escapeHtml(attendanceCopy)}</p>${resultsUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(resultsUrl)}" style="color:#19724d;font-weight:600">View poll results</a></p>` : ""}</div></div></body></html>`;
    const ics = attending
      ? buildIcs({
          method: "REQUEST",
          uid: `poll-${ctx.poll.id}@calpaca`,
          sequence: 0,
          dtStamp: Temporal.Now.instant(),
          start,
          end,
          summary: ctx.poll.title,
          ...(ctx.poll.description ? { description: ctx.poll.description } : {}),
          organizer: ctx.owner,
          attendees: [{ name: participant.name, email: participant.email }],
        })
      : null;
    try {
      const result = await sendInviteMail({
        to: participant.email,
        subject,
        text,
        html,
        messageId: `<${crypto.randomUUID()}.${ctx.poll.id}@calpaca>`,
        ...(ics ? { ics: { method: "REQUEST" as const, content: ics } } : {}),
      });
      const rejected = result.rejected.some(
        (address) => address.toLowerCase() === participant.email.toLowerCase(),
      );
      await recordPollFinalizationDelivery(
        participant.id,
        rejected ? { sent: false, error: "recipient_rejected" } : { sent: true },
      );
    } catch (error) {
      await recordPollFinalizationDelivery(participant.id, {
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

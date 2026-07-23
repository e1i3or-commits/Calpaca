import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP transport for invite emails. Configuration is two env vars:
 *   SMTP_URL   smtp[s]://user:pass@host:port (any provider; no vendor SDK)
 *   EMAIL_FROM "Name <address>" used as the envelope/From
 * Unset means email is disabled — callers check isMailerConfigured() and
 * skip, they never fake a send.
 */

let transporter: Transporter | undefined;

export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(process.env.SMTP_URL);
  }
  return transporter;
}

export interface InviteMail {
  readonly to: string;
  readonly cc?: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** RFC 5322 Message-ID, angle brackets included. Set by buildMail to a
   * value that embeds the booking id so provider bounce/delivery
   * notifications can be correlated back (see /api/webhooks/email-delivery). */
  readonly messageId?: string;
  readonly ics?: {
    readonly method: "REQUEST" | "CANCEL";
    readonly content: string;
  };
}

export interface SendResult {
  /** Recipients the SMTP server refused at handoff (RCPT TO rejection) while
   * still accepting the message for the rest. */
  readonly rejected: readonly string[];
}

/** Resolves when the SMTP server accepts the message; throws otherwise so
 * the pg-boss job retries. Per-recipient rejections on an otherwise accepted
 * message do NOT throw — they come back in `rejected` for the caller to
 * record (a retry would bounce the same way). */
export async function sendInviteMail(mail: InviteMail): Promise<SendResult> {
  const info = await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: mail.to,
    cc: mail.cc && mail.cc.length > 0 ? [...mail.cc] : undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    messageId: mail.messageId,
    ...(mail.ics
      ? {
          // both forms: an iTIP alternative part (calendar clients act on it)
          // and a plain .ics attachment (everything else can open it)
          icalEvent: {
            method: mail.ics.method,
            filename: "invite.ics",
            content: mail.ics.content,
          },
        }
      : {}),
  });
  // nodemailer's SMTP transport reports plain addresses; other transports may
  // report Address objects — normalize to the address string either way
  const rejected = (info.rejected ?? []).map((r: string | { address: string }) =>
    typeof r === "string" ? r : r.address,
  );
  return { rejected };
}

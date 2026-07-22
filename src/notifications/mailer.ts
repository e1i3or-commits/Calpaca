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
  readonly ics?: {
    readonly method: "REQUEST" | "CANCEL";
    readonly content: string;
  };
}

/** Resolves when the SMTP server accepts the message; throws otherwise so
 * the pg-boss job retries. */
export async function sendInviteMail(mail: InviteMail): Promise<void> {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: mail.to,
    cc: mail.cc && mail.cc.length > 0 ? [...mail.cc] : undefined,
    subject: mail.subject,
    text: mail.text,
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
}

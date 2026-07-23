import { Temporal } from "@js-temporal/polyfill";

/**
 * Invite email composition. Pure text/HTML templating — the transport and the
 * clock live in src/notifications/ and src/jobs/. Invitee-local time is
 * first class: every time is rendered in the recipient's zone.
 */

export type InviteKind = "created" | "rescheduled" | "cancelled" | "reminder";

export interface InviteEmailInput {
  readonly kind: InviteKind;
  readonly eventTitle: string;
  readonly inviteeName: string;
  readonly hostName: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly timezone: string;
  /** null when PUBLIC_URL is unset — the links are simply omitted. */
  readonly links: { readonly reschedule: string; readonly cancel: string } | null;
  /** false when the booking was written to Google Calendar and Google sends
   * the native invite — the "calendar file attached" line would be a lie.
   * Defaults to true (the ICS fallback path). */
  readonly icsAttached?: boolean;
  /** invitee's booking-form notes; rendered so the cc'd hosts see them */
  readonly notes?: string | null;
}

export interface InviteEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** "Wednesday, July 22, 2026, 4:30 PM" in a fixed locale so tests and
 * rendered mail don't depend on server locale settings. */
function formatInZone(instant: Temporal.Instant, timezone: string): string {
  return instant.toZonedDateTimeISO(timezone).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeOnly(instant: Temporal.Instant, timezone: string): string {
  return instant.toZonedDateTimeISO(timezone).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const SUBJECT_PREFIX: Record<InviteKind, string> = {
  created: "Confirmed",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  reminder: "Reminder",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function composeHtml(
  input: InviteEmailInput,
  opening: string,
  when: string,
): string {
  const title = escapeHtml(`${SUBJECT_PREFIX[input.kind]}: ${input.eventTitle}`);
  const timeLabel = input.kind === "cancelled" ? "Original time" : "When";
  const calendarNote =
    input.icsAttached === false
      ? "A Google Calendar invite is on its way in a separate email."
      : "A calendar file is attached—add it if it doesn’t appear automatically.";
  const notes =
    input.kind !== "cancelled" && input.notes
      ? `
        <div style="margin:24px 0 0;padding:16px;background:#f6f7f9;border-radius:8px">
          <div style="margin:0 0 6px;font-size:13px;font-weight:600;color:#4b5563">Notes from ${escapeHtml(input.inviteeName)}</div>
          <div style="margin:0;white-space:pre-wrap;color:#202124">${escapeHtml(input.notes)}</div>
        </div>`
      : "";
  const actions =
    input.kind !== "cancelled" && input.links
      ? `
        <div style="margin:28px 0 0;padding-top:22px;border-top:1px solid #e5e7eb">
          <div style="margin:0 0 12px;font-size:14px;color:#4b5563">Need to change it?</div>
          <a href="${escapeHtml(input.links.reschedule)}" style="display:inline-block;margin:0 10px 8px 0;padding:10px 16px;border-radius:7px;background:#1a73e8;color:#ffffff;text-decoration:none;font-weight:600">Reschedule</a>
          <a href="${escapeHtml(input.links.cancel)}" style="display:inline-block;padding:10px 0;color:#b42318;text-decoration:underline;font-weight:600">Cancel booking</a>
        </div>`
      : "";
  const calendar = input.kind === "cancelled"
    ? ""
    : `<p style="margin:24px 0 0;font-size:14px;color:#4b5563">${calendarNote}</p>`;

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#202124">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opening)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
            <tr>
              <td style="padding:32px">
                <div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1a73e8">${title}</div>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.55">Hi ${escapeHtml(input.inviteeName)},</p>
                <p style="margin:0 0 24px;font-size:18px;line-height:1.5">${escapeHtml(opening)}</p>
                <div style="padding:16px;border-left:4px solid #1a73e8;background:#f8fafc">
                  <div style="margin:0 0 5px;font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280">${timeLabel}</div>
                  <div style="font-size:16px;line-height:1.5">${escapeHtml(when)}</div>
                </div>${notes}${calendar}${actions}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function composeInviteEmail(input: InviteEmailInput): InviteEmail {
  const when = `${formatInZone(input.start, input.timezone)} – ${formatTimeOnly(input.end, input.timezone)} (${input.timezone})`;
  const subject = `${SUBJECT_PREFIX[input.kind]}: ${input.eventTitle} with ${input.hostName} — ${formatInZone(input.start, input.timezone)}`;

  const opening =
    input.kind === "cancelled"
      ? `Your ${input.eventTitle} with ${input.hostName} has been cancelled.`
      : input.kind === "rescheduled"
        ? `Your ${input.eventTitle} with ${input.hostName} has been rescheduled.`
        : input.kind === "reminder"
          ? `A reminder: your ${input.eventTitle} with ${input.hostName} is coming up.`
          : `You're booked: ${input.eventTitle} with ${input.hostName}.`;

  const lines = [
    `Hi ${input.inviteeName},`,
    "",
    opening,
    "",
    input.kind === "cancelled" ? `Original time: ${when}` : `When: ${when}`,
  ];

  if (input.kind !== "cancelled" && input.notes) {
    lines.push("", `Notes from ${input.inviteeName}:`, input.notes);
  }

  if (input.kind !== "cancelled") {
    lines.push(
      "",
      input.icsAttached === false
        ? "A Google Calendar invite is on its way in a separate email."
        : "A calendar file is attached — add it if it doesn't appear automatically.",
    );
    if (input.links) {
      lines.push(
        "",
        `Need to change it?`,
        `Reschedule: ${input.links.reschedule}`,
        `Cancel: ${input.links.cancel}`,
      );
    }
  }

  return {
    subject,
    text: lines.join("\n") + "\n",
    html: composeHtml(input, opening, when),
  };
}

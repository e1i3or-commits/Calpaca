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
  readonly location?: string | null;
  readonly theme?: string;
  readonly brandLogoUrl?: string | null;
}

export interface EmailTheme {
  readonly background: string;
  readonly card: string;
  readonly text: string;
  readonly muted: string;
  readonly primary: string;
  readonly panel: string;
  readonly border: string;
  readonly radius: string;
}

const EMAIL_THEMES: Record<string, EmailTheme> = {
  default: { background: "#f3f4f6", card: "#ffffff", text: "#202124", muted: "#4b5563", primary: "#1a73e8", panel: "#f8fafc", border: "#e5e7eb", radius: "12px" },
  midnight: { background: "#0f172a", card: "#182235", text: "#f8fafc", muted: "#a9b7cb", primary: "#8ba8ff", panel: "#202c42", border: "#334155", radius: "12px" },
  sand: { background: "#f4ede2", card: "#fffaf2", text: "#352b25", muted: "#75675c", primary: "#a2593f", panel: "#f7ecdc", border: "#dccbb8", radius: "12px" },
  juniper: { background: "#edf4ef", card: "#fbfdfb", text: "#18342a", muted: "#587066", primary: "#28775a", panel: "#e5f0e9", border: "#bfd2c7", radius: "12px" },
  solstice: { background: "#fff1e8", card: "#fffaf7", text: "#3b241d", muted: "#805f54", primary: "#d85a36", panel: "#ffe8d9", border: "#efc8b5", radius: "16px" },
  cobalt: { background: "#edf4ff", card: "#fbfdff", text: "#13213d", muted: "#526686", primary: "#2867d8", panel: "#e5efff", border: "#c3d6f4", radius: "12px" },
  paper: { background: "#eeeae2", card: "#fffdf7", text: "#292722", muted: "#6f6a60", primary: "#555046", panel: "#f5f1e8", border: "#d3ccbf", radius: "2px" },
  tourscale: { background: "#eef3f8", card: "#ffffff", text: "#1a1a2e", muted: "#5b6880", primary: "#f86e4f", panel: "#f1f6fa", border: "#1a1a2e", radius: "14px" },
};

export function getEmailTheme(theme: string | undefined): EmailTheme {
  return EMAIL_THEMES[theme ?? "default"] ?? EMAIL_THEMES["default"]!;
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
  const palette = getEmailTheme(input.theme);
  const title = escapeHtml(`${SUBJECT_PREFIX[input.kind]}: ${input.eventTitle}`);
  const timeLabel = input.kind === "cancelled" ? "Original time" : "When";
  const calendarNote =
    input.icsAttached === false
      ? "A Google Calendar invite is on its way in a separate email."
      : "A calendar file is attached—add it if it doesn’t appear automatically.";
  const notes =
    input.kind !== "cancelled" && input.notes
      ? `
        <div style="margin:24px 0 0;padding:16px;background:${palette.panel};border-radius:8px">
          <div style="margin:0 0 6px;font-size:13px;font-weight:600;color:${palette.muted}">Notes from ${escapeHtml(input.inviteeName)}</div>
          <div style="margin:0;white-space:pre-wrap;color:${palette.text}">${escapeHtml(input.notes)}</div>
        </div>`
      : "";
  const location = input.kind !== "cancelled" && input.location
    ? `<div style="margin:16px 0 0;padding:14px 16px;background:${palette.panel};border-radius:8px"><div style="margin:0 0 5px;font-size:12px;font-weight:700;text-transform:uppercase;color:${palette.muted}">Location</div><div style="white-space:pre-wrap">${escapeHtml(input.location)}</div></div>`
    : "";
  const actions =
    input.kind !== "cancelled" && input.links
      ? `
        <div style="margin:28px 0 0;padding-top:22px;border-top:1px solid ${palette.border}">
          <div style="margin:0 0 12px;font-size:14px;color:${palette.muted}">Need to change it?</div>
          <a href="${escapeHtml(input.links.reschedule)}" style="display:inline-block;margin:0 10px 8px 0;padding:10px 16px;border-radius:7px;background:${palette.primary};color:#ffffff;text-decoration:none;font-weight:600">Reschedule</a>
          <a href="${escapeHtml(input.links.cancel)}" style="display:inline-block;padding:10px 0;color:#b42318;text-decoration:underline;font-weight:600">Cancel booking</a>
        </div>`
      : "";
  const calendar = input.kind === "cancelled"
    ? ""
    : `<p style="margin:24px 0 0;font-size:14px;color:${palette.muted}">${calendarNote}</p>`;
  const logo = input.brandLogoUrl
    ? `<img src="${escapeHtml(input.brandLogoUrl)}" alt="" width="174" style="display:block;max-width:174px;max-height:42px;margin:0 0 24px;border:0">`
    : "";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${palette.background};font-family:Arial,Helvetica,sans-serif;color:${palette.text}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opening)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${palette.background}">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${palette.card};border:${input.theme === "tourscale" ? "2px" : "1px"} solid ${palette.border};border-radius:${palette.radius}">
            <tr>
              <td style="padding:32px">
                ${logo}<div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${palette.primary}">${title}</div>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.55">Hi ${escapeHtml(input.inviteeName)},</p>
                <p style="margin:0 0 24px;font-size:18px;line-height:1.5">${escapeHtml(opening)}</p>
                <div style="padding:16px;border-left:4px solid ${palette.primary};background:${palette.panel}">
                  <div style="margin:0 0 5px;font-size:12px;font-weight:700;text-transform:uppercase;color:${palette.muted}">${timeLabel}</div>
                  <div style="font-size:16px;line-height:1.5">${escapeHtml(when)}</div>
                </div>${location}${notes}${calendar}${actions}
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
  if (input.kind !== "cancelled" && input.location) {
    lines.push("", "Location:", input.location);
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

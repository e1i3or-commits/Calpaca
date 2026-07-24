import { Temporal } from "@js-temporal/polyfill";
import { getEmailTheme } from "./email";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function render(instant: Temporal.Instant, timezone: string): string {
  return instant.toZonedDateTimeISO(timezone).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

export function composeSuggestionEmail(input: {
  eventTypeTitle: string;
  invitee: { name: string; email: string; timezone: string };
  host: { name: string; timezone: string };
  proposedSlots: readonly { start: Temporal.Instant; end: Temporal.Instant }[];
  message?: string;
  theme?: string;
  brandLogoUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const palette = getEmailTheme(input.theme);
  const windows = input.proposedSlots.map((slot, index) => {
    const host = `${render(slot.start, input.host.timezone)} – ${render(slot.end, input.host.timezone)} (${input.host.timezone})`;
    const invitee = `${render(slot.start, input.invitee.timezone)} – ${render(slot.end, input.invitee.timezone)} (${input.invitee.timezone})`;
    return { text: `${index + 1}. ${host}\n   Invitee: ${invitee}`, host, invitee };
  });
  const messageText = input.message ? `\nMessage:\n${input.message}\n` : "";
  return {
    subject: `New time suggestion for ${input.eventTypeTitle}`,
    text: `Hi ${input.host.name},\n\n${input.invitee.name} (${input.invitee.email}) suggested these times for ${input.eventTypeTitle}:\n\n${windows.map((w) => w.text).join("\n\n")}\n${messageText}`,
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:${palette.background};font-family:Arial,Helvetica,sans-serif;color:${palette.text}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${palette.background}"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${palette.card};border:1px solid ${palette.border};border-radius:${palette.radius}"><tr><td style="padding:32px">${input.brandLogoUrl ? `<img src="${escapeHtml(input.brandLogoUrl)}" alt="" width="174" style="display:block;max-width:174px;max-height:42px;margin:0 0 24px;border:0">` : ""}<div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${palette.primary}">New time suggestion</div><p>Hi ${escapeHtml(input.host.name)},</p><p><strong>${escapeHtml(input.invitee.name)}</strong> (${escapeHtml(input.invitee.email)}) suggested these times for <strong>${escapeHtml(input.eventTypeTitle)}</strong>:</p><ol style="padding-left:22px">${windows.map((w) => `<li style="margin-bottom:14px">${escapeHtml(w.host)}<br><small style="color:${palette.muted}">Invitee: ${escapeHtml(w.invitee)}</small></li>`).join("")}</ol>${input.message ? `<div style="padding:16px;background:${palette.panel};border-radius:8px"><strong>Message:</strong><br>${escapeHtml(input.message).replace(/\n/g, "<br>")}</div>` : ""}</td></tr></table></td></tr></table></body></html>`,
  };
}

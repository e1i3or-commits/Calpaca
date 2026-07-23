import { Temporal } from "@js-temporal/polyfill";

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
}): { subject: string; text: string; html: string } {
  const windows = input.proposedSlots.map((slot, index) => {
    const host = `${render(slot.start, input.host.timezone)} – ${render(slot.end, input.host.timezone)} (${input.host.timezone})`;
    const invitee = `${render(slot.start, input.invitee.timezone)} – ${render(slot.end, input.invitee.timezone)} (${input.invitee.timezone})`;
    return { text: `${index + 1}. ${host}\n   Invitee: ${invitee}`, host, invitee };
  });
  const messageText = input.message ? `\nMessage:\n${input.message}\n` : "";
  return {
    subject: `New time suggestion for ${input.eventTypeTitle}`,
    text: `Hi ${input.host.name},\n\n${input.invitee.name} (${input.invitee.email}) suggested these times for ${input.eventTypeTitle}:\n\n${windows.map((w) => w.text).join("\n\n")}\n${messageText}`,
    html: `<p>Hi ${escapeHtml(input.host.name)},</p><p><strong>${escapeHtml(input.invitee.name)}</strong> (${escapeHtml(input.invitee.email)}) suggested these times for <strong>${escapeHtml(input.eventTypeTitle)}</strong>:</p><ol>${windows.map((w) => `<li>${escapeHtml(w.host)}<br><small>Invitee: ${escapeHtml(w.invitee)}</small></li>`).join("")}</ol>${input.message ? `<p><strong>Message:</strong><br>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>` : ""}`,
  };
}

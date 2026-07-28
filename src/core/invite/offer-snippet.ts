/**
 * The pasteable block for a one-off offer: a few times, each its own booking
 * link, ready to drop into a reply the host is already writing.
 *
 * Deliberately not a whole email. The host is mid-sentence in their own thread,
 * so this contributes only the times and a one-line note about the timezone —
 * no greeting, no sign-off, nothing that would collide with what they wrote.
 */

import type { Temporal } from "@js-temporal/polyfill";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

/** "Tuesday, July 29 · 2:00 PM EDT" — weekday included because a bare date
 * makes the reader do calendar arithmetic, and the zone name because the
 * recipient is usually somewhere else. */
function renderSlot(instant: Temporal.Instant, timezone: string): string {
  const zoned = instant.toZonedDateTimeISO(timezone);
  const date = zoned.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = zoned.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${date} · ${time}`;
}

/** Deep link that preselects one slot on the offer page. */
export function offerSlotUrl(
  offerUrl: string,
  start: Temporal.Instant,
): string {
  const separator = offerUrl.includes("?") ? "&" : "?";
  return `${offerUrl}${separator}slot=${encodeURIComponent(start.toString())}`;
}

export interface OfferSnippetInput {
  /** Absolute URL of the offer page, e.g. https://app.calpaca.io/offer/abc123 */
  readonly offerUrl: string;
  readonly slots: readonly { start: Temporal.Instant; end: Temporal.Instant }[];
  /** Zone the times are written in — the host's, since they are the author. */
  readonly timezone: string;
}

/**
 * Returns both clipboard flavors. `html` is what lands in an email client;
 * `text` is the fallback for plain-text composers, where a hyperlink cannot
 * exist and the URL therefore has to be visible rather than hidden behind
 * link text nobody can click.
 */
export function composeOfferSnippet(
  input: OfferSnippetInput,
): { text: string; html: string } {
  const rows = input.slots.map((slot) => ({
    label: renderSlot(slot.start, input.timezone),
    url: offerSlotUrl(input.offerUrl, slot.start),
  }));

  const note = rows.length === 1
    ? "Click the time to book it."
    : "Click whichever time works to book it.";

  const text = [
    ...rows.map((row) => `${row.label}\n  ${row.url}`),
    "",
    note,
  ].join("\n");

  // Inline styles only, and no classes: the destination is someone else's
  // email client, which strips <style> blocks and has no stylesheet of ours.
  const html = [
    "<div>",
    ...rows.map((row) =>
      `<div style="margin:0 0 6px"><a href="${escapeHtml(row.url)}" style="color:#316b4a">`
      + `${escapeHtml(row.label)}</a></div>`,
    ),
    `<div style="margin:10px 0 0;font-size:13px;color:#666">${escapeHtml(note)}</div>`,
    "</div>",
  ].join("");

  return { text, html };
}

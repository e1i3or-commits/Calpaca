/**
 * The pasteable block for a one-off offer: a few times, each its own booking
 * link, ready to drop into a reply the host is already writing.
 *
 * Deliberately not a whole email. The host is mid-sentence in their own thread,
 * so this contributes only the times and a one-line note about the timezone —
 * no greeting, no sign-off, nothing that would collide with what they wrote.
 *
 * Takes ISO instants and formats with Intl rather than Temporal. This is
 * rendering at a boundary, not date math (same rationale as
 * web/src/lib/time.ts), and keeping it dependency-free is what lets the
 * dashboard import this module without pulling the Temporal polyfill into the
 * browser bundle.
 */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

/** "Wednesday, July 29 · 2:00 PM EDT" — weekday included because a bare date
 * makes the reader do calendar arithmetic, and the zone name because the
 * recipient is usually somewhere else. */
export function formatSlotLabel(startIso: string, timeZone: string): string {
  const at = new Date(startIso);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);
  return `${date} · ${time}`;
}

/** Deep link that preselects one slot on the offer page. */
export function offerSlotUrl(offerUrl: string, startIso: string): string {
  const separator = offerUrl.includes("?") ? "&" : "?";
  return `${offerUrl}${separator}slot=${encodeURIComponent(startIso)}`;
}

/**
 * Resolves a `?slot=` value back to the offered slot it names, or undefined.
 *
 * Compared as parsed instants, not raw strings. `offerSlotUrl` embeds whatever
 * ISO form the caller stored, and the same moment is spelled several ways
 * ("2026-07-29T18:00:00Z", "2026-07-29T18:00:00.000Z",
 * "2026-07-29T18:00:00+00:00"). String equality would miss those and silently
 * drop the invitee back onto the full list — a broken-feeling link rather than
 * a visible error, which is why this lives next to the function that writes it.
 */
export function findSlotByInstant<T extends { start: string }>(
  slots: readonly T[] | undefined,
  startIso: string | undefined,
): T | undefined {
  if (!slots?.length || !startIso) return undefined;
  const target = Date.parse(startIso);
  if (Number.isNaN(target)) return undefined;
  return slots.find((slot) => Date.parse(slot.start) === target);
}

export interface OfferSnippetInput {
  /** Absolute URL of the offer page, e.g. https://app.calpaca.io/offer/abc123 */
  readonly offerUrl: string;
  readonly slots: readonly { start: string; end: string }[];
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
    label: formatSlotLabel(slot.start, input.timezone),
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

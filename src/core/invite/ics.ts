import { Temporal } from "@js-temporal/polyfill";

/**
 * Minimal RFC 5545 iTIP builder for the invite emails. A plain ICS is always
 * attached (docs/ARCHITECTURE.md trust details) — never rely on Google
 * auto-add. Pure: DTSTAMP is a parameter, not a clock read.
 */

export interface IcsPerson {
  readonly name: string;
  readonly email: string;
}

export interface IcsInput {
  readonly method: "REQUEST" | "CANCEL";
  /** Stable per booking across reschedules; clients match on UID. */
  readonly uid: string;
  /** Bump on every reschedule; CANCEL must be >= the last REQUEST's. */
  readonly sequence: number;
  readonly dtStamp: Temporal.Instant;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly organizer: IcsPerson;
  readonly attendees: readonly IcsPerson[];
}

/** RFC 5545 3.3.11: backslash, semicolon, comma, and newlines are escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 3.1: lines longer than 75 octets fold with CRLF + single space. */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length;
    // continuation lines start with a space, so they hold one byte less
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

/** 20260722T203000Z — ICS UTC form, no separators, whole seconds. */
function formatUtc(instant: Temporal.Instant): string {
  return instant
    .toZonedDateTimeISO("UTC")
    .toPlainDateTime()
    .toString({ fractionalSecondDigits: 0 })
    .replace(/[-:]/g, "")
    .concat("Z");
}

function personLine(prop: "ORGANIZER" | "ATTENDEE", person: IcsPerson): string {
  const params =
    prop === "ATTENDEE"
      ? `;CN=${escapeText(person.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE`
      : `;CN=${escapeText(person.name)}`;
  return `${prop}${params}:mailto:${person.email}`;
}

export function buildIcs(input: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//scheduling-platform//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${formatUtc(input.dtStamp)}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    `STATUS:${input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    personLine("ORGANIZER", input.organizer),
    ...input.attendees.map((a) => personLine("ATTENDEE", a)),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

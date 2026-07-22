import { Temporal } from "@js-temporal/polyfill";

/**
 * Invite email composition. Pure text templating — the transport and the
 * clock live in src/notifications/ and src/jobs/. Invitee-local time is
 * first class: every time is rendered in the recipient's zone.
 */

export type InviteKind = "created" | "rescheduled" | "cancelled";

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
}

export interface InviteEmail {
  readonly subject: string;
  readonly text: string;
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
};

export function composeInviteEmail(input: InviteEmailInput): InviteEmail {
  const when = `${formatInZone(input.start, input.timezone)} – ${formatTimeOnly(input.end, input.timezone)} (${input.timezone})`;
  const subject = `${SUBJECT_PREFIX[input.kind]}: ${input.eventTitle} with ${input.hostName} — ${formatInZone(input.start, input.timezone)}`;

  const opening =
    input.kind === "cancelled"
      ? `Your ${input.eventTitle} with ${input.hostName} has been cancelled.`
      : input.kind === "rescheduled"
        ? `Your ${input.eventTitle} with ${input.hostName} has been rescheduled.`
        : `You're booked: ${input.eventTitle} with ${input.hostName}.`;

  const lines = [
    `Hi ${input.inviteeName},`,
    "",
    opening,
    "",
    input.kind === "cancelled" ? `Original time: ${when}` : `When: ${when}`,
  ];

  if (input.kind !== "cancelled") {
    lines.push("", "A calendar file is attached — add it if it doesn't appear automatically.");
    if (input.links) {
      lines.push(
        "",
        `Need to change it?`,
        `Reschedule: ${input.links.reschedule}`,
        `Cancel: ${input.links.cancel}`,
      );
    }
  }

  return { subject, text: lines.join("\n") + "\n" };
}

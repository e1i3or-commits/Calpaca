import { Temporal } from "@js-temporal/polyfill";

// Outbound webhook contract — the extension boundary (webhooks + n8n, see
// ARCHITECTURE.md). External event names are namespaced so consumers can
// route on prefix; internal booking_event kinds map 1:1.

export type WebhookEventKind =
  | "booking.created"
  | "booking.rescheduled"
  | "booking.cancelled"
  | "booking.reassigned"
  | "booking.no_show"
  | "booking.invite_sent"
  | "booking.invite_delivered"
  | "booking.invite_failed"
  | "booking.reminder_sent"
  | "suggestion.created";

export const WEBHOOK_EVENT_KINDS: readonly WebhookEventKind[] = [
  "booking.created",
  "booking.rescheduled",
  "booking.cancelled",
  "booking.reassigned",
  "booking.no_show",
  "booking.invite_sent",
  "booking.invite_delivered",
  "booking.invite_failed",
  "booking.reminder_sent",
  "suggestion.created",
];

/** A subscription's `events` list matches an event when it names it or
 * contains the "*" wildcard. */
export function matchesSubscription(events: readonly string[], event: WebhookEventKind): boolean {
  return events.includes("*") || events.includes(event);
}

export interface SuggestionWebhookInput {
  readonly suggestionId: string;
  readonly eventType: { readonly id: string; readonly slug: string; readonly title: string };
  readonly invitee: { readonly email: string; readonly name: string; readonly timezone: string };
  readonly proposedSlots: readonly { readonly start: Temporal.Instant; readonly end: Temporal.Instant }[];
  readonly message?: string;
}

export function buildSuggestionWebhookBody(input: {
  readonly deliveryId: string;
  readonly occurredAt: Temporal.Instant;
  readonly suggestion: SuggestionWebhookInput;
}): string {
  const tz = input.suggestion.invitee.timezone;
  return JSON.stringify({
    deliveryId: input.deliveryId,
    event: "suggestion.created",
    occurredAt: input.occurredAt.toString(),
    data: {
      suggestion: {
        id: input.suggestion.suggestionId,
        eventType: input.suggestion.eventType,
        invitee: input.suggestion.invitee,
        proposedSlots: input.suggestion.proposedSlots.map((slot) => ({
          start: renderInstant(slot.start, tz),
          end: renderInstant(slot.end, tz),
        })),
        ...(input.suggestion.message !== undefined && { message: input.suggestion.message }),
      },
    },
  });
}

export interface WebhookBookingInput {
  readonly bookingId: string;
  readonly eventType: { readonly id: string; readonly slug: string; readonly title: string };
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly status: string;
  readonly invitee: { readonly email: string; readonly name: string; readonly timezone: string };
  readonly hosts: readonly { readonly id: string; readonly name: string; readonly email: string }[];
  readonly reason?: string;
}

export interface WebhookPayloadInput {
  readonly deliveryId: string;
  readonly event: WebhookEventKind;
  readonly occurredAt: Temporal.Instant;
  readonly booking: WebhookBookingInput;
}

/** Both-renderings rule: every time in an API response carries UTC and the
 * invitee-declared zone (CLAUDE.md time handling). Webhooks are a client. */
function renderInstant(instant: Temporal.Instant, timezone: string): { utc: string; invitee: string } {
  return {
    utc: instant.toString(),
    invitee: instant.toZonedDateTimeISO(timezone).toString(),
  };
}

/**
 * Builds the canonical delivery body as a string: the exact bytes that get
 * signed and POSTed. Built once at fan-out time so every retry delivers an
 * identical body and consumers can dedupe on deliveryId.
 */
export function buildWebhookBody(input: WebhookPayloadInput): string {
  const tz = input.booking.invitee.timezone;
  return JSON.stringify({
    deliveryId: input.deliveryId,
    event: input.event,
    occurredAt: input.occurredAt.toString(),
    data: {
      booking: {
        id: input.booking.bookingId,
        eventType: input.booking.eventType,
        start: renderInstant(input.booking.start, tz),
        end: renderInstant(input.booking.end, tz),
        status: input.booking.status,
        invitee: input.booking.invitee,
        hosts: input.booking.hosts,
        ...(input.booking.reason !== undefined && { reason: input.booking.reason }),
      },
    },
  });
}

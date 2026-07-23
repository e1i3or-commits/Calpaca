import { Temporal } from "@js-temporal/polyfill";
import { composeSuggestionEmail } from "../core/invite/suggestion-email";
import { getTimeSuggestionContext } from "../db/suggestion-repo";
import { isMailerConfigured, sendInviteMail } from "../notifications/mailer";

export async function sendSuggestionEmail(suggestionId: string): Promise<void> {
  if (!isMailerConfigured()) return;
  const ctx = await getTimeSuggestionContext(suggestionId);
  if (!ctx) return;
  const slots = ctx.proposedSlots.map((slot) => ({
    start: Temporal.Instant.from(slot.start),
    end: Temporal.Instant.from(slot.end),
  }));
  for (const host of ctx.hosts) {
    await sendInviteMail({
      to: host.email,
      ...composeSuggestionEmail({
        eventTypeTitle: ctx.eventType.title,
        invitee: {
          name: ctx.inviteeName,
          email: ctx.inviteeEmail,
          timezone: ctx.inviteeTimezone,
        },
        host: { name: host.name, timezone: host.timezone },
        proposedSlots: slots,
        ...(ctx.message !== undefined && { message: ctx.message }),
      }),
    });
  }
}

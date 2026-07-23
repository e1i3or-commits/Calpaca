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
  const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
  const configuredLogo = ctx.eventType.logoUrl;
  const logoPath =
    configuredLogo ??
    (ctx.eventType.theme === "tourscale" ? "/brand/tourscale-logo-color.svg" : null);
  const brandLogoUrl =
    logoPath?.startsWith("http://") || logoPath?.startsWith("https://")
      ? logoPath
      : logoPath && base
        ? `${base}${logoPath.startsWith("/") ? "" : "/"}${logoPath}`
        : null;
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
        theme: ctx.eventType.theme,
        brandLogoUrl,
        ...(ctx.message !== undefined && { message: ctx.message }),
      }),
    });
  }
}

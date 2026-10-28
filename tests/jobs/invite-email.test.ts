import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { buildMail } from "../../src/jobs/invite-email";
import type { InviteContext } from "../../src/db/booking-repo";

const NOW = Temporal.Instant.from("2026-07-28T12:00:00Z");

function context(guestEmails: string[] = []): InviteContext {
  return {
    booking: {
      id: "b1",
      eventTypeId: "et1",
      startsAt: Temporal.Instant.from("2026-07-30T13:30:00Z"),
      endsAt: Temporal.Instant.from("2026-07-30T14:00:00Z"),
      inviteeEmail: "invitee@example.com",
      inviteeName: "Invitee",
      inviteeTimezone: "America/New_York",
      hostUserIds: ["u1", "u2"],
      status: "confirmed",
      rescheduleToken: "r",
      cancelToken: "c",
      bookingAnswers: {},
      guestEmails,
    },
    eventTypeTitle: "Intro call",
    eventTypeSlug: "intro",
    hosts: [
      { id: "u1", name: "Organizer", email: "organizer@example.com", timezone: "America/New_York" },
      { id: "u2", name: "Second Host", email: "second@example.com", timezone: "America/New_York" },
    ],
    rescheduleCount: 0,
  };
}

describe("buildMail recipients", () => {
  for (const kind of ["created", "rescheduled", "cancelled", "reminder"] as const) {
    test(`${kind} ICS lists the organizer once as a participant without changing identity or recipients`, () => {
      const base = context(["g1@example.com", "ORGANIZER@example.com"]);
      const ctx: InviteContext = { ...base, rescheduleCount: 2,
        hosts: [base.hosts[0]!, { ...base.hosts[1]!, role: "optional" }] };
      const mail = buildMail(ctx, kind, NOW);
      const lines = mail.ics!.content.replace(/\r\n /g, "").split("\r\n");
      const attendees = lines.filter((line) => line.startsWith("ATTENDEE;"));
      expect(attendees).toHaveLength(4);
      expect(attendees.filter((line) => line.endsWith(":mailto:organizer@example.com")))
        .toHaveLength(1);
      expect(lines).toContain("ORGANIZER;CN=Organizer:mailto:organizer@example.com");
      expect(lines).toContain("UID:b1@scheduling-platform");
      expect(lines).toContain("SEQUENCE:2");
      expect(lines).toContain(`METHOD:${kind === "cancelled" ? "CANCEL" : "REQUEST"}`);
      expect(attendees.find((line) => line.endsWith(":mailto:second@example.com")))
        .toContain("ROLE=OPT-PARTICIPANT");
      expect(mail.to).toBe("invitee@example.com");
      expect(mail.cc).toEqual(["organizer@example.com", "second@example.com", "g1@example.com"]);
      expect(mail.replyTo).toBe("organizer@example.com");
    });
  }

  test("a solo organizer is an attendee, and an overlapping invitee is not duplicated", () => {
    const base = context();
    const ctx: InviteContext = { ...base, hosts: [base.hosts[0]!] };
    const attendees = (mail: ReturnType<typeof buildMail>) => mail.ics!.content
      .replace(/\r\n /g, "").split("\r\n").filter((line) => line.startsWith("ATTENDEE;"));
    expect(attendees(buildMail(ctx, "created", NOW))).toHaveLength(2);
    const overlapping = { ...ctx, booking: { ...ctx.booking, inviteeEmail: "ORGANIZER@example.com" } };
    expect(attendees(buildMail(overlapping, "created", NOW))).toHaveLength(1);
  });

  test("native Google invitations still omit the fallback ICS attachment", () => {
    expect(buildMail(context(), "created", NOW, { includeIcs: false }).ics).toBeUndefined();
  });

  test("without guests, Cc is exactly the hosts", () => {
    const mail = buildMail(context(), "created", NOW);
    expect(mail.to).toBe("invitee@example.com");
    expect(mail.cc).toEqual(["organizer@example.com", "second@example.com"]);
  });

  // The organizer is Cc'd but a plain reply must still reach a human rather
  // than the unattended EMAIL_FROM address.
  test("Reply-To stays the organizer regardless of guests", () => {
    expect(buildMail(context(["g@example.com"]), "created", NOW).replyTo)
      .toBe("organizer@example.com");
  });

  test("guests are appended to Cc after the hosts", () => {
    const mail = buildMail(context(["g1@example.com", "g2@example.com"]), "created", NOW);
    expect(mail.cc).toEqual([
      "organizer@example.com",
      "second@example.com",
      "g1@example.com",
      "g2@example.com",
    ]);
  });

  test("the invitee is never moved out of To by adding guests", () => {
    expect(buildMail(context(["g1@example.com"]), "created", NOW).to)
      .toBe("invitee@example.com");
  });

  test("guests appear as ICS attendees on the fallback path", () => {
    const mail = buildMail(context(["g1@example.com"]), "created", NOW, { includeIcs: true });
    expect(mail.ics?.content).toContain("mailto:g1@example.com");
    // the guest ATTENDEE line exceeds 75 octets, so unfold before matching
    // (see tests/core/invite/ics.test.ts for the same pattern)
    const unfolded = mail.ics?.content.replace(/\r\n /g, "");
    expect(unfolded).not.toContain("CN=;");
    expect(unfolded).toContain(
      "ATTENDEE;CN=g1@example.com;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:g1@example.com\r\n",
    );
  });

  test("cancellations reach guests too, so nobody keeps a dead hold", () => {
    const mail = buildMail(context(["g1@example.com"]), "cancelled", NOW);
    expect(mail.cc).toContain("g1@example.com");
    expect(mail.ics?.method).toBe("CANCEL");
  });

  // The design claims reschedule and cancel need no new code. These two assert
  // that claim rather than trusting it.
  test("reschedules reach guests", () => {
    expect(buildMail(context(["g1@example.com"]), "rescheduled", NOW).cc)
      .toContain("g1@example.com");
  });

  test("reminders reach guests", () => {
    expect(buildMail(context(["g1@example.com"]), "reminder", NOW).cc)
      .toContain("g1@example.com");
  });

  // A host added to the event type after the booking would otherwise be
  // invited twice: once as a host, once as the guest they were booked as.
  test("a guest who is also a host is not Cc'd twice", () => {
    const mail = buildMail(context(["second@example.com", "g1@example.com"]), "created", NOW);
    expect(mail.cc).toEqual([
      "organizer@example.com",
      "second@example.com",
      "g1@example.com",
    ]);
  });
});

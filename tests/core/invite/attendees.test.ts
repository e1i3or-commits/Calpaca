import { describe, expect, test } from "bun:test";
import { buildBookingAttendees } from "../../../src/core/invite/attendees";

describe("booking attendees", () => {
  const invitee = { name: "Invitee", email: "invitee@example.com" };
  const organizer = { name: "Organizer", email: "organizer@example.com" };

  test("a solo host attends even though they also organize the event", () => {
    expect(buildBookingAttendees(invitee, [organizer])).toEqual([invitee, organizer]);
  });

  test("all hosts and guests attend, retaining optional host roles", () => {
    const optional = { name: "Optional", email: "optional@example.com", role: "optional" as const };
    expect(buildBookingAttendees(invitee, [organizer, optional], ["guest@example.com"]))
      .toEqual([invitee, organizer, optional, { name: "guest@example.com", email: "guest@example.com" }]);
  });

  test("overlapping invitee, hosts and guests produce one entry per address", () => {
    const hosts = [organizer, { name: "Duplicate", email: "ORGANIZER@example.com" }, invitee];
    const guests = [" INVITEE@example.com ", " ORGANIZER@example.com ", "guest@example.com", "GUEST@example.com"];
    expect(buildBookingAttendees(invitee, hosts, guests)).toEqual([
      invitee, organizer, { name: "guest@example.com", email: "guest@example.com" },
    ]);
    expect(hosts).toHaveLength(3);
    expect(guests).toHaveLength(4);
  });
});

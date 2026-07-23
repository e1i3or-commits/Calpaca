import { describe, expect, test } from "bun:test";
import { legacyLocations, resolveBookingLocation } from "../../../src/core/booking/locations";

describe("booking locations", () => {
  test("resolves the assigned host override into a stable snapshot", () => {
    expect(resolveBookingLocation({
      id: "office",
      type: "in_person",
      label: "Office",
      address: "1 Main St",
      hostOverrides: {
        host2: { label: "West office", address: "2 West St", instructions: "Floor 4" },
      },
    }, "host2")).toEqual({
      id: "office",
      type: "in_person",
      label: "West office",
      address: "2 West St",
      instructions: "Floor 4",
    });
  });

  test("maps legacy meeting formats without changing existing links", () => {
    expect(legacyLocations(["google_meet", "phone"])).toEqual([
      { id: "google-meet", type: "google_meet", label: "Google Meet" },
      {
        id: "phone",
        type: "phone",
        label: "Phone call",
        phoneDirection: "organizer_calls_invitee",
      },
    ]);
  });
});

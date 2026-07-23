export type LocationType = "google_meet" | "phone" | "in_person" | "custom_url";
export type PhoneDirection = "organizer_calls_invitee" | "invitee_calls_organizer";

export type LocationDetails = {
  label: string;
  address?: string;
  instructions?: string;
  url?: string;
  phoneNumber?: string;
  phoneDirection?: PhoneDirection;
};

export type EventLocation = LocationDetails & {
  id: string;
  type: LocationType;
  hostOverrides?: Record<string, Partial<LocationDetails>>;
};

export type BookingLocation = LocationDetails & {
  id: string;
  type: LocationType;
};

export function resolveBookingLocation(
  location: EventLocation,
  hostUserId?: string,
): BookingLocation {
  const override = hostUserId ? location.hostOverrides?.[hostUserId] : undefined;
  const { hostOverrides, ...base } = location;
  void hostOverrides;
  return { ...base, ...override };
}

export function legacyLocations(
  formats: readonly ("phone" | "google_meet")[],
): EventLocation[] {
  return formats.map((format) => format === "phone"
    ? {
        id: "phone",
        type: "phone",
        label: "Phone call",
        phoneDirection: "organizer_calls_invitee",
      }
    : { id: "google-meet", type: "google_meet", label: "Google Meet" });
}

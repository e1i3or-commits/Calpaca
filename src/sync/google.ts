import { err, ok, type Result } from "../lib/result";

// Thin fetch wrapper over Google Calendar REST. No googleapis dependency:
// the three endpoints v1 needs (calendarList, freeBusy, events) do not
// justify the monolith. Tokens come from BetterAuth's account store via
// auth.api.getAccessToken; this module never sees a refresh token.

export type GoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
};

export type GoogleApiError = {
  kind: "http_error" | "network_error";
  status?: number;
  message: string;
};

const BASE = "https://www.googleapis.com/calendar/v3";

export async function listCalendars(
  accessToken: string,
): Promise<Result<GoogleCalendar[], GoogleApiError>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    return err({ kind: "network_error", message: String(e) });
  }
  if (!res.ok) {
    return err({
      kind: "http_error",
      status: res.status,
      message: `calendarList returned ${res.status}`,
    });
  }
  const body = (await res.json()) as {
    items?: { id: string; summary?: string; primary?: boolean; accessRole?: string }[];
  };
  return ok(
    (body.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary ?? "",
      primary: item.primary ?? false,
      accessRole: item.accessRole ?? "reader",
    })),
  );
}

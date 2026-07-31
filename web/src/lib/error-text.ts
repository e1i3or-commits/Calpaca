import { ApiError } from "@/lib/api";

export const ERROR_TEXT: Record<string, string> = {
  slug_taken: "That slug is already taken.",
  schedule_in_use: "Event types still use this schedule.",
  cannot_forward_to_self: "Choose another person for forwarding.",
  write_destination_required: "Choose another booking destination before disconnecting this calendar.",
  calendar_not_writable: "Google does not allow this account to create events on that calendar.",
  event_type_in_use: "This event type has bookings; it can't be deleted.",
  invalid_body: "Some fields are invalid. Check the form.",
  team_not_found: "Team not found.",
  last_team_admin: "Promote another member before removing or demoting the final team admin.",
  form_not_found: "Routing form not found.",
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? `Error: ${e.code}`;
  return "Could not reach the server.";
}

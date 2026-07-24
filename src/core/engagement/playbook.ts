export const playbookStatuses = ["draft", "ready", "retired"] as const;
export type PlaybookStatus = (typeof playbookStatuses)[number];

export type PlaybookReadinessInput = {
  purpose: string | null;
  participantRoles: readonly { role: string; required: boolean }[];
  preparationItems: readonly { label: string; required: boolean }[];
  outcomeDefinition: string | null;
  durationMinutes: number;
  scheduleId: string | null;
  hostCount: number;
};

export type PlaybookReadinessIssue =
  | "purpose"
  | "participants"
  | "outcome"
  | "duration"
  | "schedule"
  | "hosts";

export function playbookReadiness(
  input: PlaybookReadinessInput,
): { ready: boolean; issues: PlaybookReadinessIssue[] } {
  const issues: PlaybookReadinessIssue[] = [];
  if (!input.purpose?.trim()) issues.push("purpose");
  if (!input.participantRoles.some((participant) => participant.required)) {
    issues.push("participants");
  }
  if (!input.outcomeDefinition?.trim()) issues.push("outcome");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5) {
    issues.push("duration");
  }
  if (!input.scheduleId) issues.push("schedule");
  if (input.hostCount < 1) issues.push("hosts");
  return { ready: issues.length === 0, issues };
}

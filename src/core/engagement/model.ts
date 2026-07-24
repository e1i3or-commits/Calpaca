export const engagementStatuses = [
  "draft",
  "potential",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type EngagementStatus = (typeof engagementStatuses)[number];

export const engagementTypes = [
  "project",
  "retainer",
  "discovery",
  "internal",
  "other",
] as const;

export type EngagementType = (typeof engagementTypes)[number];

export type EngagementVisibility = "workspace" | "restricted";

const transitions: Record<EngagementStatus, readonly EngagementStatus[]> = {
  draft: ["potential", "active", "archived"],
  potential: ["active", "paused", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "completed", "archived"],
  completed: ["active", "archived"],
  archived: [],
};

export function canTransitionEngagement(
  from: EngagementStatus,
  to: EngagementStatus,
): boolean {
  return from === to || transitions[from].includes(to);
}

import type { EngagementVisibility } from "./model";

export type EngagementActor = {
  userId: string;
  workspaceRole: "owner" | "admin" | "member";
};

export type EngagementAccess = {
  visibility: EngagementVisibility;
  accountLeadUserId: string;
  assignedUserIds: readonly string[];
};

export function canCreateEngagement(actor: EngagementActor): boolean {
  return ["owner", "admin", "member"].includes(actor.workspaceRole);
}

export function canViewEngagement(
  actor: EngagementActor,
  engagement: EngagementAccess,
): boolean {
  if (actor.workspaceRole === "owner" || actor.workspaceRole === "admin") return true;
  if (engagement.visibility === "workspace") return true;
  return engagement.accountLeadUserId === actor.userId
    || engagement.assignedUserIds.includes(actor.userId);
}

export function canManageEngagement(
  actor: EngagementActor,
  engagement: Pick<EngagementAccess, "accountLeadUserId">,
): boolean {
  return actor.workspaceRole === "owner"
    || actor.workspaceRole === "admin"
    || engagement.accountLeadUserId === actor.userId;
}

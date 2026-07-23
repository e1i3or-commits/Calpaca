export type WorkspacePlan = "free" | "pro" | "business" | "self_hosted";

export interface WorkspaceEntitlements {
  readonly memberLimit: number | null;
  readonly customDomains: boolean;
  readonly whitelabel: boolean;
  readonly inviteeCalendarOverlay: boolean;
  readonly meetingPolls: boolean;
}

const plans: Record<WorkspacePlan, WorkspaceEntitlements> = {
  free: {
    memberLimit: 1,
    customDomains: false,
    whitelabel: false,
    inviteeCalendarOverlay: false,
    meetingPolls: false,
  },
  pro: {
    memberLimit: 5,
    customDomains: true,
    whitelabel: true,
    inviteeCalendarOverlay: true,
    meetingPolls: true,
  },
  business: {
    memberLimit: null,
    customDomains: true,
    whitelabel: true,
    inviteeCalendarOverlay: true,
    meetingPolls: true,
  },
  self_hosted: {
    memberLimit: null,
    customDomains: true,
    whitelabel: true,
    inviteeCalendarOverlay: true,
    meetingPolls: true,
  },
};

export function entitlementsFor(plan: WorkspacePlan): WorkspaceEntitlements {
  return plans[plan];
}

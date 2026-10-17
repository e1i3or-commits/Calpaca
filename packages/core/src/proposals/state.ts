export const proposalStatuses = [
  "draft",
  "awaiting_internal_confirmation",
  "ready",
  "awaiting_client",
  "accepted",
  "expired",
  "withdrawn",
] as const;

export type ProposalStatus = typeof proposalStatuses[number];

export type ProposalAction =
  | "mark_ready"
  | "request_confirmation"
  | "approve"
  | "return_to_draft"
  | "send"
  | "accept"
  | "expire"
  | "withdraw";

const transitions: Record<ProposalStatus, Partial<Record<ProposalAction, ProposalStatus>>> = {
  draft: {
    mark_ready: "ready",
    request_confirmation: "awaiting_internal_confirmation",
    withdraw: "withdrawn",
  },
  awaiting_internal_confirmation: {
    approve: "ready",
    return_to_draft: "draft",
    withdraw: "withdrawn",
  },
  ready: {
    return_to_draft: "draft",
    send: "awaiting_client",
    withdraw: "withdrawn",
  },
  awaiting_client: {
    accept: "accepted",
    expire: "expired",
    withdraw: "withdrawn",
  },
  accepted: {},
  expired: {},
  withdrawn: {},
};

export function transitionProposal(
  status: ProposalStatus,
  action: ProposalAction,
): ProposalStatus | null {
  return transitions[status][action] ?? null;
}

export function effectiveProposalStatus(
  status: ProposalStatus,
  expiresAt: Date,
  now = new Date(),
): ProposalStatus {
  return status === "awaiting_client" && expiresAt <= now ? "expired" : status;
}

export function canEditProposal(status: ProposalStatus): boolean {
  return status === "draft"
    || status === "awaiting_internal_confirmation"
    || status === "ready";
}

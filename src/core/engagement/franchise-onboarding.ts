import { z } from "zod";

const id = z.string().uuid();
const crmId = z.string().regex(/^[0-9]{10,30}$/);
const name = z.string().trim().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/);
export const onboardingCadences = ["weekly", "biweekly", "monthly"] as const;
export type OnboardingCadence = typeof onboardingCadences[number];
export const franchiseOnboardingInput = z.object({
  sourceWorkspaceId: id,
  sourceProjectKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  locationKey: id,
  franchiseeId: crmId,
  businessUnitId: crmId,
  primaryContactId: crmId,
  clientName: name,
  locationName: name,
  existingClientId: id.optional(),
  workdriveFolderId: z.string().regex(/^[a-zA-Z0-9]{10,100}$/).optional(),
  franchiseSuccessUserIds: z.array(id).length(4),
  kaiUserId: id,
  andrewUserId: id,
  accountLeadUserId: id,
  organizerUserId: id,
  kickoffDurationMinutes: z.literal(45).default(45),
  followupDurationMinutes: z.literal(45).default(45),
}).strict().superRefine((value, ctx) => {
  if (new Set([...value.franchiseSuccessUserIds, value.kaiUserId, value.andrewUserId]).size !== 6)
    ctx.addIssue({ code: "custom", path: ["franchiseSuccessUserIds"], message: "Select the four Franchise Success members and two distinct leaders" });
});
export type FranchiseOnboardingInput = z.infer<typeof franchiseOnboardingInput>;
export interface OnboardingHost { userId: string; role: "required"|"optional" }
export interface OnboardingAttendance { kickoff: OnboardingHost[]; followup: OnboardingHost[] }

/** Required team attendance takes precedence if an optional leader also belongs to that team. */
export function onboardingAttendance(input: FranchiseOnboardingInput): OnboardingAttendance {
  const success = new Set(input.franchiseSuccessUserIds);
  const leaders = new Set([input.kaiUserId, input.andrewUserId]);
  return {
    kickoff: [...new Set([...success, ...leaders])].sort().map(userId => ({ userId, role: "required" })),
    followup: [...new Set([...success, input.kaiUserId, input.andrewUserId])].sort().map(userId => ({ userId, role: success.has(userId) ? "required" : "optional" })),
  };
}

/** Normalize only unordered roster input; never compare display names as identity. */
export function canonicalOnboardingInput(input: FranchiseOnboardingInput): FranchiseOnboardingInput {
  return { ...input, franchiseSuccessUserIds: [...input.franchiseSuccessUserIds].sort() };
}

export const onboardingCadenceUpdate = z.object({
  revision: z.number().int().positive(), cadence: z.enum(onboardingCadences),
}).strict();

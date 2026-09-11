import { describe, expect, test } from "bun:test";
import { canonicalOnboardingInput, franchiseOnboardingInput, onboardingAttendance, onboardingCadenceUpdate } from "../../../src/core/engagement/franchise-onboarding";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const raw = {sourceWorkspaceId:id(1),sourceProjectKey:"new-location",locationKey:id(2),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Sample Franchisee",locationName:"Sample City",franchiseSuccessUserIds:[id(3),id(4),id(5),id(6)],kaiUserId:id(7),andrewUserId:id(8),accountLeadUserId:id(3),organizerUserId:id(3)};
describe("franchise onboarding policy", () => {
 test("defaults both meetings to 45 minutes and applies the agreed six-person roster", () => {
  const input=franchiseOnboardingInput.parse(raw),hosts=onboardingAttendance(input);
  expect(input.kickoffDurationMinutes).toBe(45);expect(input.followupDurationMinutes).toBe(45);
  expect(hosts.kickoff).toHaveLength(6);expect(hosts.kickoff.every(host=>host.role==="required")).toBe(true);
  expect(hosts.followup.filter(host=>host.role==="required").map(host=>host.userId)).toEqual(raw.franchiseSuccessUserIds);
  expect(hosts.followup.filter(host=>host.role==="optional").map(host=>host.userId)).toEqual([raw.kaiUserId,raw.andrewUserId]);
 });
 test("rejects duplicates, omitted team members and arbitrary keys", () => {
  for(const patch of [{franchiseSuccessUserIds:[id(3)]},{andrewUserId:id(3)},{sendInvites:true},{sourceProjectKey:"../other"},{kickoffDurationMinutes:30},{followupDurationMinutes:60}])expect(franchiseOnboardingInput.safeParse({...raw,...patch}).success).toBe(false);
 });
 test("canonicalizes roster order and accepts only the three calendar cadences", () => {
  const input=franchiseOnboardingInput.parse(raw);
  expect(canonicalOnboardingInput({...input,franchiseSuccessUserIds:[...input.franchiseSuccessUserIds].reverse()})).toEqual(input);
  for(const cadence of ["weekly","biweekly","monthly"])expect(onboardingCadenceUpdate.safeParse({revision:1,cadence}).success).toBe(true);
  expect(onboardingCadenceUpdate.safeParse({revision:0,cadence:"every-30-days"}).success).toBe(false);
 });
});

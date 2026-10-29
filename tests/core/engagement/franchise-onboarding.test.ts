import { describe, expect, test } from "bun:test";
import { canonicalOnboardingInput, franchiseOnboardingInput, onboardingAttendance, onboardingCadenceUpdate } from "../../../src/core/engagement/franchise-onboarding";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const raw = {sourceWorkspaceId:id(1),sourceProjectKey:"new-location",locationKey:id(2),franchiseeId:"5854883000000000001",businessUnitId:"5854883000000000002",primaryContactId:"5854883000000000003",clientName:"Sample Franchisee",locationName:"Sample City",franchiseSuccessUserIds:[id(3),id(4),id(5),id(6)],kaiUserId:id(7),andrewUserId:id(8),accountLeadUserId:id(3),organizerUserId:id(3)};
describe("franchise onboarding policy", () => {
 test("supports the current three-person team without duplicating its lead", () => {
  const input=franchiseOnboardingInput.parse({...raw,franchiseSuccessUserIds:raw.franchiseSuccessUserIds.slice(0,3)});
  const hosts=onboardingAttendance(input);
  expect(hosts.kickoff).toHaveLength(5);
  expect(hosts.followup.filter(host=>host.role==="required")).toHaveLength(3);
  expect(franchiseOnboardingInput.safeParse({...raw,franchiseSuccessUserIds:[id(3),id(4),id(3)]}).success).toBe(false);
 });
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
 test("accepts legacy Zoho and Twenty-native CRM identities, nothing else", () => {
  const twenty = {...raw, franchiseeId:"FDB00227-A8F0-4453-B965-3C0110907AA3", businessUnitId:"0b9e1c4a-2d3f-4e5a-9b6c-7d8e9f0a1b2c", primaryContactId:"5854883000000000003"};
  const parsed = franchiseOnboardingInput.parse(twenty);
  expect(parsed.franchiseeId).toBe("fdb00227-a8f0-4453-b965-3c0110907aa3");
  expect(parsed.businessUnitId).toBe("0b9e1c4a-2d3f-4e5a-9b6c-7d8e9f0a1b2c");
  for (const bad of ["abc", "123", "fdb00227-a8f0-4453-b965", "fdb00227-a8f0-0453-b965-3c0110907aa3"])
   expect(franchiseOnboardingInput.safeParse({...raw, franchiseeId:bad}).success).toBe(false);
 });
});

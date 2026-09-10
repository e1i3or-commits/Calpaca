import { expect, test } from "bun:test";
import { evaluateKickoffReadiness, KICKOFF_SYNC_MAX_AGE_MS, type KickoffParticipantEvidence } from "../../../src/core/engagement/kickoff-readiness";

const now = new Date("2026-09-10T16:00:00Z");
function roster(): KickoffParticipantEvidence[] {
  return Array.from({length:6}, (_, i) => ({ userId:`person-${i}`, name:`Person ${i}`, active:true,
    schedules:[{timezone:"America/New_York", rules:[{dow:1,start:"09:00",end:"17:00"}],overrides:[]}],
    calendars:[{conflictEnabled:true,isWriteDestination:i===4,syncHealthy:true,lastSyncedAt:now,fullSyncedAt:now}] }));
}

test("all six calendars can pass setup without authorizing publication or assuming the first host organizes", () => {
  const report = evaluateKickoffReadiness(roster(), "person-4", now);
  expect(report.calendarSetupReady).toBe(true);
  expect(report.participants).toHaveLength(6);
  expect(report.organizer).toMatchObject({userId:"person-4",ready:true});
  expect(report.canPublish).toBe(false);
  expect(report.kickoffBookingUrl).toBeNull();
  expect(report.remainingSteps).toContain("verified_invitation_delivery");
  expect(evaluateKickoffReadiness(roster().slice(1),"person-4",now).calendarSetupReady).toBe(false);
});

test("missing or inactive participants and ambiguous schedules remain visible and block setup", () => {
  const people = roster();
  people[0]!.active=false; people[0]!.schedules=[]; people[0]!.calendars=[];
  people[1]!.schedules.push({...people[1]!.schedules[0]!});
  people[2]!.schedules[0]!.timezone="invalid/zone";
  const report=evaluateKickoffReadiness(people,"person-4",now);
  expect(report.calendarSetupReady).toBe(false);
  expect(report.participants).toHaveLength(6);
  expect(report.participants[0]!.issues.map(issue=>issue.code)).toEqual(["participant_inactive","schedule_missing","calendar_missing"]);
  expect(report.participants[1]!.issues[0]?.code).toBe("schedule_ambiguous");
  expect(report.participants[2]!.issues[0]?.code).toBe("schedule_invalid");
});

test("the least healthy enabled conflict calendar blocks setup, including absent or future sync evidence", () => {
  for (const timestamp of [null, new Date(now.getTime()-KICKOFF_SYNC_MAX_AGE_MS-1),new Date(now.getTime()+1)]) {
    const people=roster();
    people[0]!.calendars.push({...people[0]!.calendars[0]!,lastSyncedAt:timestamp,syncHealthy:false,fullSyncedAt:null});
    const report=evaluateKickoffReadiness(people,"person-4",now);
    expect(report.calendarSetupReady).toBe(false);
    expect(report.participants[0]!.issues.map(issue=>issue.code)).toEqual(["calendar_unhealthy","calendar_stale","calendar_baseline_stale"]);
    people[0]!.calendars[1]!.conflictEnabled=false;
    expect(evaluateKickoffReadiness(people,"person-4",now).calendarSetupReady).toBe(true);
  }
});

test("the organizer's destination is checked even when excluded from conflict checking", () => {
  const people=roster();
  people[4]!.calendars[0]!.isWriteDestination=false;
  expect(evaluateKickoffReadiness(people,"person-4",now).organizer.issues[0]?.code).toBe("organizer_calendar_missing");
  people[4]!.calendars.push({conflictEnabled:false,isWriteDestination:true,syncHealthy:false,lastSyncedAt:null,fullSyncedAt:null});
  expect(evaluateKickoffReadiness(people,"person-4",now).calendarSetupReady).toBe(false);
  expect(evaluateKickoffReadiness(people,"person-4",now).organizer.issues.map(issue=>issue.code)).toContain("calendar_unhealthy");
});

test("active forwarding is flagged but past overrides and usable one-off hours are allowed", () => {
  const people=roster();
  const schedule=people[0]!.schedules[0]!;
  people[0]!.schedules=[{...schedule,overrides:[{startDate:"2026-09-10",endDate:"2026-09-12",kind:"unavailable",forwardToUserId:"substitute"}]}];
  expect(evaluateKickoffReadiness(people,"person-4",now).participants[0]!.issues[0]?.code).toBe("schedule_forwarding");
  people[0]!.schedules=[{...schedule,rules:[],overrides:[{startDate:"2026-09-10",endDate:"2026-09-12",kind:"available",start:"09:00",end:"17:00"},
    {startDate:"2026-09-01",endDate:"2026-09-02",kind:"unavailable",forwardToUserId:"substitute"}]}];
  expect(evaluateKickoffReadiness(people,"person-4",now).calendarSetupReady).toBe(true);
});

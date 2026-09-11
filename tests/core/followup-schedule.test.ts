import {expect,test} from "bun:test";
import {Temporal} from "@js-temporal/polyfill";
import {followupRule,localSlot,previewSchedule,recurrenceSlots,type PlannedOccurrence,type FollowupRule} from "../../src/core/engagement/followup-schedule";
const rule=(patch:Partial<FollowupRule>={}):FollowupRule=>({cadence:"biweekly",anchorDate:"2027-03-05",localTime:"10:00",timezone:"America/New_York",monthlyMode:"day_of_month",count:6,...patch});
const row=(id:string,day:string,exception=false):PlannedOccurrence=>({id,position:Number(id),...localSlot(day,"10:00","UTC"),status:"draft",exception});
test("weekly and biweekly retain local time across spring and fall DST while lasting 45 minutes",()=>{
 for(const cadence of ["weekly","biweekly"] as const)for(const anchorDate of ["2027-03-05","2027-10-29"]) {
  const slots=recurrenceSlots(rule({cadence,anchorDate}));
  expect(new Set(slots.map(slot=>Temporal.Instant.from(slot.startsAt).toZonedDateTimeISO("America/New_York").offset)).size).toBe(2);
  for(const slot of slots) {
   const start=Temporal.Instant.from(slot.startsAt),end=Temporal.Instant.from(slot.endsAt);
   expect(start.toZonedDateTimeISO("America/New_York").hour).toBe(10);
   expect(end.since(start).total({unit:"minutes"})).toBe(45);
  }
 }
});
test("monthly dates use shorter month ends without drifting the original day, including leap years",()=>{
 expect(recurrenceSlots(rule({cadence:"monthly",anchorDate:"2027-01-31",count:4})).map(row=>row.date)).toEqual(["2027-01-31","2027-02-28","2027-03-31","2027-04-30"]);
 expect(recurrenceSlots(rule({cadence:"monthly",anchorDate:"2028-01-31",count:3})).map(row=>row.date)).toEqual(["2028-01-31","2028-02-29","2028-03-31"]);
});
test("monthly weekday positions support second Tuesdays and last weekdays",()=>{
 expect(recurrenceSlots(rule({cadence:"monthly",anchorDate:"2027-01-12",monthlyMode:"weekday_position",count:3})).map(row=>row.date)).toEqual(["2027-01-12","2027-02-09","2027-03-09"]);
 expect(recurrenceSlots(rule({cadence:"monthly",anchorDate:"2027-01-29",monthlyMode:"weekday_position",count:3})).map(row=>row.date)).toEqual(["2027-01-29","2027-02-26","2027-03-26"]);
});
test("DST gaps and folds are explicit preview errors rather than silently shifted meetings",()=>{
 for(const [anchorDate,localTime] of [["2027-03-07","02:30"],["2027-10-31","01:30"]]) {
  const preview=previewSchedule(null,{action:"configure",rule:rule({cadence:"weekly",anchorDate,localTime,count:2})},"2027-01-01T00:00:00Z");
  expect(preview.canApply).toBe(false);expect(preview.issues.join(" ")).toContain("ambiguous or does not exist");
 }
});
test("cadence changes preserve history and exceptions and reuse future occurrence identities",()=>{
 const current={status:"planned" as const,rule:rule(),occurrences:[row("1","2026-12-01"),row("2","2027-01-05"),row("3","2027-01-15",true),row("4","2027-01-20"),row("5","2027-01-30",true)]};
 const preview=previewSchedule(current,{action:"configure",rule:rule({anchorDate:"2027-02-02",timezone:"UTC",count:2})},"2027-01-01T00:00:00Z");
 expect(preview.canApply).toBe(true);
 expect(preview.changes.map(row=>[row.id,row.action])).toEqual([["2","move"],["3","keep"],["4","cancel"],["5","keep"]]);
 expect(preview.changes.find(row=>row.id==="3")?.startsAt).toBe(current.occurrences[2]!.startsAt);
 expect(current.occurrences[0]!.status).toBe("draft");
});
test("overlapping exceptions, past anchors and moves, and edits after ending fail explicitly",()=>{
 const current={status:"planned" as const,rule:rule({timezone:"UTC"}),occurrences:[row("1","2027-01-05"),row("2","2027-01-12",true)]};
 expect(previewSchedule(current,{action:"configure",rule:rule({cadence:"weekly",anchorDate:"2027-01-12",timezone:"UTC",count:2})},"2027-01-01T00:00:00Z").issues.join(" ")).toContain("overlap");
 expect(previewSchedule(null,{action:"configure",rule:rule({anchorDate:"2026-01-01"})},"2027-01-01T00:00:00Z").canApply).toBe(false);
 expect(previewSchedule(current,{action:"move",occurrenceId:"1",date:"2026-01-01",time:"10:00"},"2027-01-01T00:00:00Z").canApply).toBe(false);
 expect(previewSchedule({...current,status:"ended"},{action:"resume"},"2027-01-01T00:00:00Z").canApply).toBe(false);
});
test("pause, resume and end affect only future dates",()=>{
 const current={status:"planned" as const,rule:rule(),occurrences:[row("1","2026-12-01"),row("2","2027-01-05")]};
 for(const [action,status] of [["pause","paused"],["end","cancelled"]] as const){const p=previewSchedule(current,{action},"2027-01-01T00:00:00Z");expect(p.changes).toHaveLength(1);expect(p.changes[0]).toMatchObject({id:"2",status});}
 expect(previewSchedule({...current,status:"paused"},{action:"resume"},"2027-01-01T00:00:00Z").changes[0]?.status).toBe("draft");
});
test("input rejects invalid dates, offset-only timezones, unknown settings and unbounded plans",()=>{
 for(const patch of [{anchorDate:"2027-02-30"},{timezone:"+05:00"},{timezone:"Not/AZone"},{localTime:"25:00"},{count:13},{durationMinutes:60}])expect(followupRule.safeParse({...rule(),...patch}).success).toBe(false);
});

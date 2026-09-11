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

test("rolling extension maintains the horizon and monthly anchor without rewriting history",()=>{
 const monthly=rule({cadence:"monthly",anchorDate:"2027-01-31",timezone:"UTC",count:3});
 const occurrences=recurrenceSlots(monthly).map((slot,i)=>({...row(String(i+1),slot.date),startsAt:slot.startsAt,endsAt:slot.endsAt}));
 const current={status:"planned" as const,rule:monthly,nextRecurrenceIndex:3,occurrences};
 const preview=previewSchedule(current,{action:"extend"},"2027-02-01T00:00:00Z");
 expect(preview.canApply).toBe(true);expect(preview.changes).toHaveLength(1);expect(preview.changes[0]).toMatchObject({id:null,position:4,startsAt:"2027-04-30T10:00:00.000Z"});expect(preview.nextRecurrenceIndex).toBe(4);
 expect(current.occurrences[0]?.startsAt).toBe("2027-01-31T10:00:00.000Z");
 const later=previewSchedule(current,{action:"extend"},"2030-04-01T00:00:00Z");expect(later.canApply).toBe(true);expect(later.changes.map(row=>row.startsAt)).toEqual(["2030-04-30T10:00:00.000Z","2030-05-31T10:00:00.000Z","2030-06-30T10:00:00.000Z"]);
});
test("rolling extension blocks future DST ambiguity and exception overlap instead of changing their times",()=>{
 const weekly=rule({cadence:"weekly",anchorDate:"2027-10-31",localTime:"01:30",count:1});
 const current={status:"planned" as const,rule:weekly,nextRecurrenceIndex:1,occurrences:[{...row("1","2027-10-31"),...localSlot("2027-10-31","01:30","America/New_York")}]};
 expect(previewSchedule(current,{action:"extend"},"2027-11-01T00:00:00Z").issues.join(" ")).toContain("ambiguous");
 const exception={status:"planned" as const,rule:rule({cadence:"weekly",anchorDate:"2027-01-05",timezone:"UTC",count:2}),nextRecurrenceIndex:2,occurrences:[row("1","2027-01-05"),row("2","2027-01-19",true)]};
 expect(previewSchedule(exception,{action:"extend"},"2027-01-06T00:00:00Z").issues).toContain("Two proposed meetings overlap. Move the individual exception or choose a different series time.");
 expect(previewSchedule({...exception,status:"paused"},{action:"extend"},"2027-01-06T00:00:00Z").canApply).toBe(false);
});
test("shortening a plan advances its next date independently of retired occurrence positions",()=>{
 const current={status:"planned" as const,rule:rule({cadence:"weekly",anchorDate:"2027-01-05",timezone:"UTC",count:4}),nextRecurrenceIndex:4,occurrences:[row("1","2027-01-05"),row("2","2027-01-12"),row("3","2027-01-19"),row("4","2027-01-26")]};
 const shortened=previewSchedule(current,{action:"configure",rule:{...current.rule,count:2}},"2027-01-01T00:00:00Z");expect(shortened.nextRecurrenceIndex).toBe(2);
 const next=previewSchedule({...current,rule:{...current.rule,count:2},nextRecurrenceIndex:shortened.nextRecurrenceIndex,occurrences:shortened.changes.map(change=>({...change,id:change.id!}))},{action:"extend"},"2027-01-06T00:00:00Z");
 expect(next.canApply).toBe(true);expect(next.changes[0]).toMatchObject({position:5,startsAt:"2027-01-19T10:00:00.000Z"});
});

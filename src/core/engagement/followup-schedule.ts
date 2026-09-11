import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { onboardingCadences } from "./franchise-onboarding";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { Temporal.PlainDate.from(value); return true; } catch { return false; }
}, "Choose a valid date");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().min(1).max(100).refine(value => {
  try { return !/^[+-]/.test(value) && !!Temporal.Now.zonedDateTimeISO(value); } catch { return false; }
}, "Choose an IANA timezone");
export const followupRule = z.object({
  cadence: z.enum(onboardingCadences), anchorDate: date, localTime: time, timezone,
  monthlyMode: z.enum(["day_of_month", "weekday_position"]),
  count: z.number().int().min(1).max(12).default(6),
}).strict();
export type FollowupRule = z.infer<typeof followupRule>;
export const followupPreviewInput = z.object({
  revision: z.number().int().positive(),
  command: z.discriminatedUnion("action", [
    z.object({action: z.literal("configure"), rule: followupRule}).strict(),
    z.object({action: z.literal("move"), occurrenceId: z.string().uuid(), date, time}).strict(),
    z.object({action: z.enum(["pause", "resume", "end", "extend"])}).strict(),
  ]),
}).strict();
export type FollowupPreviewInput = z.infer<typeof followupPreviewInput>;
export const followupApplyInput = followupPreviewInput.extend({requestId: z.string().uuid(), previewHash: z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type FollowupApplyInput = z.infer<typeof followupApplyInput>;
export type ScheduleStatus = "planned" | "paused" | "ended";
export interface PlannedOccurrence {
  id: string; position: number; startsAt: string; endsAt: string;
  status: "draft" | "paused" | "cancelled"; exception: boolean;
  reservationIssue?: {code:string;ownerUserId:string|null};
  bookingId?: string; inviteStatus?: string; bookingStatus?: string; deliveryStatus?: string; deliveryKind?: string;
}
export interface ScheduleSnapshot {
  revision: number; engagementStatus: string; canManage: boolean;
  schedule: {status: ScheduleStatus; rule: FollowupRule; nextRecurrenceIndex?: number; occurrences: PlannedOccurrence[]} | null;
  deliveryState: "not_invited" | "reservations_present";
  extensionIssue?: {code:string;ownerUserId:string|null}|null;
}
export interface ScheduleChange {
  id: string | null; position: number; action: "create" | "move" | "keep" | "cancel" | "pause" | "resume";
  startsAt: string; endsAt: string; previousStartsAt: string | null;
  status: PlannedOccurrence["status"]; exception: boolean;
}
export interface SchedulePreview {
  changes: ScheduleChange[]; issues: string[]; canApply: boolean;
  status: ScheduleStatus; rule: FollowupRule | null; nextRecurrenceIndex?: number;
}

export function localSlot(day: string, clock: string, zone: string) {
  // Reject both clock gaps and folds; silently choosing an offset can move a
  // franchisee's meeting. A different unambiguous time must be previewed.
  const start = Temporal.PlainDate.from(day).toPlainDateTime(Temporal.PlainTime.from(clock))
    .toZonedDateTime(zone, {disambiguation: "reject"}).toInstant();
  return {startsAt: start.toString({fractionalSecondDigits:3}), endsAt: start.add({minutes: 45}).toString({fractionalSecondDigits:3})};
}

export function recurrenceSlots(rule: FollowupRule, offset=0) {
  const anchor = Temporal.PlainDate.from(rule.anchorDate);
  return Array.from({length: rule.count}, (_, index) => {
    const i=index+offset;
    let day: Temporal.PlainDate;
    if (rule.cadence !== "monthly") day = anchor.add({weeks: i * (rule.cadence === "biweekly" ? 2 : 1)});
    else {
      const month = anchor.with({day: 1}).add({months: i});
      if (rule.monthlyMode === "day_of_month") day = month.with({day: Math.min(anchor.day, month.daysInMonth)});
      else if (anchor.day + 7 > anchor.daysInMonth) {
        const last = month.with({day: month.daysInMonth});
        day = last.subtract({days: (last.dayOfWeek - anchor.dayOfWeek + 7) % 7});
      } else {
        const ordinal = Math.floor((anchor.day - 1) / 7);
        day = month.add({days: (anchor.dayOfWeek - month.dayOfWeek + 7) % 7 + ordinal * 7});
      }
    }
    try { return {date: day.toString(), ...localSlot(day.toString(), rule.localTime, rule.timezone), issue: null}; }
    catch { return {date: day.toString(), startsAt: "", endsAt: "", issue: `The local time on ${day} is ambiguous or does not exist in ${rule.timezone}. Choose another time.`}; }
  });
}

export function previewSchedule(current: ScheduleSnapshot["schedule"], command: FollowupPreviewInput["command"], now: string): SchedulePreview {
  const changes: ScheduleChange[] = [], issues: string[] = [];
  let status = current?.status ?? "planned", rule = current?.rule ?? null;
  const instant = Temporal.Instant.from(now);
  let nextRecurrenceIndex=current?.nextRecurrenceIndex??current?.rule.count??0;
  const future = (current?.occurrences ?? []).filter(row => row.status !== "cancelled" && Temporal.Instant.compare(Temporal.Instant.from(row.startsAt), instant) > 0).sort((a,b) => a.position - b.position);
  const change = (row: PlannedOccurrence, action: ScheduleChange["action"], patch: Partial<ScheduleChange> = {}) => ({...row, action, previousStartsAt: row.startsAt, ...patch});
  if (current?.status === "ended") issues.push("This schedule has ended. Its history is preserved.");
  if (command.action === "configure") {
    rule = command.rule;
    const slots = recurrenceSlots(rule);
    let position = Math.max(0, ...(current?.occurrences ?? []).map(row => row.position));
    slots.forEach((slot, i) => {
      const old = future[i];
      if (old?.exception) { changes.push(change(old, "keep")); return; }
      if (slot.issue) { issues.push(slot.issue); return; }
      if (Temporal.Instant.compare(Temporal.Instant.from(slot.startsAt), instant) <= 0) issues.push(`The proposed meeting on ${slot.date} is not in the future. Choose a future first follow-up date.`);
      const rowStatus = status === "paused" ? "paused" : "draft";
      if (old) changes.push(change(old, old.startsAt === slot.startsAt && old.endsAt === slot.endsAt ? "keep" : "move", {...slot, status: rowStatus}));
      else changes.push({id: null, position: ++position, action: "create", startsAt: slot.startsAt, endsAt: slot.endsAt, previousStartsAt: null, status: rowStatus, exception: false});
    });
    for (const old of future.slice(slots.length)) changes.push(change(old, old.exception ? "keep" : "cancel", {status: old.exception ? old.status : "cancelled"}));
    nextRecurrenceIndex=Math.max(rule.count,...changes.map((row,index)=>row.action==="cancel"?0:index+1));
  } else if (!current) issues.push("Save a follow-up schedule first.");
  else if(command.action==="extend") {
    if(status!=="planned")issues.push("Only a planned schedule can be extended.");
    else {
      const needed=Math.max(0,current.rule.count-future.length);
      if(needed) {
        const anchor=Temporal.PlainDate.from(current.rule.anchorDate),today=instant.toZonedDateTimeISO(current.rule.timezone).toPlainDate();
        const elapsed=current.rule.cadence==="monthly"?today.since(anchor,{largestUnit:"months"}).months:
          Math.floor(today.since(anchor,{largestUnit:"days"}).days/(current.rule.cadence==="biweekly"?14:7));
        let index=Math.max(nextRecurrenceIndex,elapsed-1),position=Math.max(0,...current.occurrences.map(row=>row.position));
        for(let attempt=0;attempt<needed+3&&changes.length<needed;attempt++) {
          const slot=recurrenceSlots({...current.rule,count:1},index)[0]!;index++;
          if(Temporal.PlainDate.compare(Temporal.PlainDate.from(slot.date),today)<0)continue;
          if(slot.issue){issues.push(slot.issue);break;}
          if(Temporal.Instant.compare(Temporal.Instant.from(slot.startsAt),instant)<=0)continue;
          changes.push({id:null,position:++position,action:"create",startsAt:slot.startsAt,endsAt:slot.endsAt,previousStartsAt:null,status:"draft",exception:false});
        }
        if(!issues.length&&changes.length!==needed)issues.push("The next follow-up dates could not be generated. Review the cadence anchor.");
        nextRecurrenceIndex=index;
      }
    }
  }
  else if (command.action === "move") {
    const row = future.find(item => item.id === command.occurrenceId);
    if (!row) issues.push("Only an existing future meeting can be moved.");
    else {
      try {
        const slot = localSlot(command.date, command.time, current.rule.timezone);
        if (Temporal.Instant.compare(Temporal.Instant.from(slot.startsAt), instant) <= 0) issues.push("Choose a future time for this meeting.");
        changes.push(change(row, "move", {...slot, exception: true}));
      } catch { issues.push("This local time is ambiguous or does not exist. Choose another time."); }
    }
  } else {
    if (command.action === "pause") {
      if (status !== "planned") issues.push("Only a planned schedule can be paused.");
      status = "paused";
    } else if (command.action === "resume") {
      if (status !== "paused") issues.push("Only a paused schedule can be resumed.");
      status = "planned";
    } else status = "ended";
    for (const row of future) changes.push(change(row, command.action === "end" ? "cancel" : command.action, {status: status === "ended" ? "cancelled" : status === "paused" ? "paused" : "draft"}));
  }
  const changed = new Map(changes.filter(row => row.id).map(row => [row.id, row]));
  const ongoing = (current?.occurrences ?? []).filter(row => row.status !== "cancelled" && Temporal.Instant.compare(Temporal.Instant.from(row.startsAt), instant) <= 0 && Temporal.Instant.compare(Temporal.Instant.from(row.endsAt), instant) > 0);
  const resulting = [...ongoing, ...future.map(row => changed.get(row.id) ?? row), ...changes.filter(row => !row.id)].filter(row => row.status !== "cancelled").sort((a,b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 1; i < resulting.length; i++) if (Temporal.Instant.compare(Temporal.Instant.from(resulting[i]!.startsAt), Temporal.Instant.from(resulting[i-1]!.endsAt)) < 0) issues.push("Two proposed meetings overlap. Move the individual exception or choose a different series time.");
  return {changes, issues: [...new Set(issues)], canApply: issues.length === 0, status, rule, nextRecurrenceIndex};
}

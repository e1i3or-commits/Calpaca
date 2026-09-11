import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "./schema";
type Db=NodePgDatabase<typeof s>;
const intervalMs=15*60_000;
const futureCount=(now:Date)=>sql<number>`(select count(*) from ${s.onboardingFollowupOccurrences} where ${s.onboardingFollowupOccurrences.onboardingId}=${s.onboardingFollowupSchedules.onboardingId} and ${s.onboardingFollowupOccurrences.status}='draft' and ${s.onboardingFollowupOccurrences.startsAt}>${now})`;
const eligible=()=>and(isNotNull(s.onboardingFollowups.enabledAt),eq(s.engagements.status,"active"),eq(s.onboardingFollowupSchedules.status,"planned"));
export async function listDueFollowupExtensions(db:Db,now=new Date()) {
 return db.select({onboardingId:s.franchiseOnboarding.id,workspaceId:s.franchiseOnboarding.workspaceId,engagementId:s.engagements.id,revision:s.franchiseOnboarding.revision,actorUserId:s.onboardingFollowups.createdByUserId})
  .from(s.onboardingFollowupSchedules).innerJoin(s.onboardingFollowups,eq(s.onboardingFollowups.onboardingId,s.onboardingFollowupSchedules.onboardingId))
  .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId)).innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
  .where(and(eligible(),or(sql`${futureCount(now)}<(${s.onboardingFollowupSchedules.rule}->>'count')::int`,isNotNull(s.onboardingFollowupSchedules.extensionIssueCode)),
    or(isNull(s.onboardingFollowupSchedules.extensionCheckedAt),lte(s.onboardingFollowupSchedules.extensionCheckedAt,new Date(now.getTime()-intervalMs)))))
  .orderBy(asc(sql`coalesce(${s.onboardingFollowupSchedules.extensionCheckedAt},timestamp 'epoch')`)).limit(20);
}
export type ExtensionCandidate=Awaited<ReturnType<typeof listDueFollowupExtensions>>[number];
export async function recordFollowupExtensionResult(row:ExtensionCandidate,revision:number,code:string|null,db:Db) {
 return db.transaction(async tx=>{
  await tx.select({id:s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.id,row.workspaceId)).for("update");
  await tx.select({id:s.engagements.id}).from(s.engagements).where(eq(s.engagements.id,row.engagementId)).for("share");
  const [current]=await tx.select({schedule:s.onboardingFollowupSchedules,owner:s.engagements.accountLeadUserId}).from(s.onboardingFollowupSchedules)
    .innerJoin(s.onboardingFollowups,eq(s.onboardingFollowups.onboardingId,s.onboardingFollowupSchedules.onboardingId))
    .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId)).innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
    .where(and(eligible(),eq(s.franchiseOnboarding.id,row.onboardingId),eq(s.franchiseOnboarding.workspaceId,row.workspaceId),eq(s.franchiseOnboarding.revision,revision)));
  if(!current)return;
  if(current.schedule.extensionIssueCode!==code||(code&&current.schedule.extensionOwnerUserId!==current.owner))await tx.insert(s.followupSchedulerEvents).values({onboardingId:row.onboardingId,actorUserId:row.actorUserId,ownerUserId:current.owner,outcome:code?"blocked":"resolved",issueCode:code??current.schedule.extensionIssueCode});
  await tx.update(s.onboardingFollowupSchedules).set({extensionCheckedAt:new Date(),extensionIssueCode:code,extensionOwnerUserId:code?current.owner:null,
    extensionIssueAt:code?(current.schedule.extensionIssueCode===code?current.schedule.extensionIssueAt:new Date()):null}).where(eq(s.onboardingFollowupSchedules.onboardingId,row.onboardingId));
 });
}
export async function followupExtensionHealth(workspaceId:string,db:Db,now=new Date()) {
 const missing=sql`${futureCount(now)}<(${s.onboardingFollowupSchedules.rule}->>'count')::int`;
 const dueSince=sql`greatest(${s.onboardingFollowups.enabledAt},${s.onboardingFollowupSchedules.updatedAt},
   (select max(${s.onboardingFollowupOccurrences.startsAt}) from ${s.onboardingFollowupOccurrences} where ${s.onboardingFollowupOccurrences.onboardingId}=${s.onboardingFollowupSchedules.onboardingId} and ${s.onboardingFollowupOccurrences.startsAt}<=${now}))`;
 const [count]=await db.select({extensionAttention:sql<number>`count(*) filter(where ${s.onboardingFollowupSchedules.extensionIssueCode} is not null)::int`,
   extensionOverdue:sql<number>`count(*) filter(where ${missing} and ${dueSince}<${new Date(now.getTime()-intervalMs)})::int`})
  .from(s.onboardingFollowupSchedules).innerJoin(s.onboardingFollowups,eq(s.onboardingFollowups.onboardingId,s.onboardingFollowupSchedules.onboardingId))
  .innerJoin(s.franchiseOnboarding,eq(s.franchiseOnboarding.id,s.onboardingFollowups.onboardingId)).innerJoin(s.engagements,eq(s.engagements.id,s.franchiseOnboarding.engagementId))
  .where(and(eligible(),eq(s.franchiseOnboarding.workspaceId,workspaceId)));
 return {extensionAttention:count?.extensionAttention??0,extensionOverdue:count?.extensionOverdue??0};
}

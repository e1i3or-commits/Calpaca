import {and,eq} from "drizzle-orm";
import type {NodePgDatabase} from "drizzle-orm/node-postgres";
import * as s from "./schema";
export async function onboardingAutomationActor(workspaceId:string,userId:string,db:NodePgDatabase<typeof s>) {
  const [identity]=await db.select({role:s.workspaceMembers.role,status:s.users.status,membershipStatus:s.workspaceMembers.status})
    .from(s.workspaceMembers).innerJoin(s.users,eq(s.users.id,s.workspaceMembers.userId))
    .where(and(eq(s.workspaceMembers.workspaceId,workspaceId),eq(s.workspaceMembers.userId,userId)));
  return identity?.status==="active" && identity.membershipStatus==="active" && (identity.role==="admin" || identity.role==="owner")
    ? {userId,workspaceRole:identity.role}:null;
}

import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./client";
import { inviteeCalendarSessions } from "./schema";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createInviteeCalendarSession(args: {
  state: string;
  returnUrl: string;
  expiresAt: Date;
}) {
  const [row] = await getDb().insert(inviteeCalendarSessions).values({
    stateHash: hash(args.state),
    returnUrl: args.returnUrl,
    expiresAt: args.expiresAt,
  }).returning({ id: inviteeCalendarSessions.id });
  return row!;
}

export async function getPendingInviteeCalendarSession(state: string, now = new Date()) {
  const [row] = await getDb().select().from(inviteeCalendarSessions).where(and(
    eq(inviteeCalendarSessions.stateHash, hash(state)),
    eq(inviteeCalendarSessions.status, "pending"),
    gt(inviteeCalendarSessions.expiresAt, now),
  ));
  return row ?? null;
}

export async function completeInviteeCalendarSession(args: {
  id: string;
  capability: string;
  busy: { start: string; end: string }[];
  expiresAt: Date;
}) {
  const [row] = await getDb().update(inviteeCalendarSessions).set({
    capabilityHash: hash(args.capability),
    busy: args.busy,
    status: "connected",
    expiresAt: args.expiresAt,
  }).where(and(
    eq(inviteeCalendarSessions.id, args.id),
    eq(inviteeCalendarSessions.status, "pending"),
  )).returning({ id: inviteeCalendarSessions.id });
  return row ?? null;
}

export async function getInviteeCalendarSession(capability: string, now = new Date()) {
  const [row] = await getDb().select({
    busy: inviteeCalendarSessions.busy,
    expiresAt: inviteeCalendarSessions.expiresAt,
  }).from(inviteeCalendarSessions).where(and(
    eq(inviteeCalendarSessions.capabilityHash, hash(capability)),
    eq(inviteeCalendarSessions.status, "connected"),
    gt(inviteeCalendarSessions.expiresAt, now),
  ));
  return row ?? null;
}

export async function deleteInviteeCalendarSession(capability: string) {
  await getDb().delete(inviteeCalendarSessions).where(
    eq(inviteeCalendarSessions.capabilityHash, hash(capability)),
  );
}

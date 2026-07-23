import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import {
  signupRegistrations,
  signupSessions,
  signupSheets,
} from "./schema";
import { generateToken } from "../lib/id";

type Db = NodePgDatabase<typeof schema>;

export type SignupQuestion = {
  id: string;
  label: string;
  required: boolean;
};

export type SignupSheetRecord = {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  timezone: string;
  status: string;
  rosterVisibility: string;
  maxRegistrationsPerPerson: number;
  questions: SignupQuestion[];
  sessions: {
    id: string;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    registrationCount: number;
    registrations?: {
      id: string;
      name: string;
      email: string;
      answers: Record<string, string>;
      status: string;
      confirmationSentAt: Date | null;
      confirmationError: string | null;
      createdAt: Date;
    }[];
  }[];
};

function publicToken(): string {
  return randomBytes(18).toString("base64url");
}

async function hydrateSheet(
  sheet: typeof signupSheets.$inferSelect,
  ownerView: boolean,
  executor: Db,
): Promise<SignupSheetRecord> {
  const [sessions, registrations] = await Promise.all([
    executor.select().from(signupSessions)
      .where(eq(signupSessions.sheetId, sheet.id))
      .orderBy(asc(signupSessions.startsAt)),
    executor.select().from(signupRegistrations)
      .where(eq(signupRegistrations.sheetId, sheet.id))
      .orderBy(asc(signupRegistrations.createdAt)),
  ]);
  return {
    id: sheet.id,
    publicId: sheet.publicId,
    title: sheet.title,
    description: sheet.description,
    timezone: sheet.timezone,
    status: sheet.status,
    rosterVisibility: sheet.rosterVisibility,
    maxRegistrationsPerPerson: sheet.maxRegistrationsPerPerson,
    questions: sheet.questions,
    sessions: sessions.map((session) => {
      const sessionRegistrations = registrations.filter((row) => row.sessionId === session.id);
      const enrolled = sessionRegistrations.filter((row) => row.status === "active");
      return {
        id: session.id,
        title: session.title,
        description: session.description,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        capacity: session.capacity,
        registrationCount: enrolled.length,
        ...((ownerView || sheet.rosterVisibility === "names")
          ? {
              registrations: (ownerView ? sessionRegistrations : enrolled).map((row) => ({
                id: row.id,
                name: row.name,
                ...(ownerView ? { email: row.email, answers: row.answers } : { email: "", answers: {} }),
                status: row.status,
                confirmationSentAt: ownerView ? row.confirmationSentAt : null,
                confirmationError: ownerView ? row.confirmationError : null,
                createdAt: row.createdAt,
              })),
            }
          : {}),
      };
    }),
  };
}

export async function updateSignupSheetAdministration(input: {
  workspaceId: string;
  sheetId: string;
  status?: "open" | "closed";
  rosterVisibility?: "hidden" | "counts" | "names";
  capacities?: { sessionId: string; capacity: number }[];
}, executor: Db = getDb()): Promise<SignupSheetRecord | null> {
  return executor.transaction(async (tx) => {
    const [sheet] = await tx.select().from(signupSheets).where(and(
      eq(signupSheets.id, input.sheetId),
      eq(signupSheets.workspaceId, input.workspaceId),
    )).for("update");
    if (!sheet) return null;
    if (input.status || input.rosterVisibility) {
      await tx.update(signupSheets).set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.rosterVisibility ? { rosterVisibility: input.rosterVisibility } : {}),
      }).where(eq(signupSheets.id, sheet.id));
    }
    for (const item of input.capacities ?? []) {
      await tx.update(signupSessions).set({ capacity: item.capacity }).where(and(
        eq(signupSessions.id, item.sessionId),
        eq(signupSessions.sheetId, sheet.id),
      ));
    }
    const [updated] = await tx.select().from(signupSheets).where(eq(signupSheets.id, sheet.id));
    return updated ? hydrateSheet(updated, true, tx) : null;
  });
}

export async function cancelSignupRegistrationByOrganizer(input: {
  workspaceId: string;
  sheetId: string;
  registrationId: string;
}, executor: Db = getDb()): Promise<boolean> {
  const rows = await executor.update(signupRegistrations).set({ status: "cancelled" })
    .where(and(
      eq(signupRegistrations.id, input.registrationId),
      eq(signupRegistrations.sheetId, input.sheetId),
      eq(signupRegistrations.status, "active"),
      inArray(signupRegistrations.sheetId, executor.select({ id: signupSheets.id })
        .from(signupSheets).where(eq(signupSheets.workspaceId, input.workspaceId))),
    ))
    .returning({ id: signupRegistrations.id });
  return rows.length > 0;
}

export async function getSignupRegistrationForResend(input: {
  workspaceId: string;
  sheetId: string;
  registrationId: string;
}, executor: Db = getDb()): Promise<string[] | null> {
  const rows = await executor.select({ id: signupRegistrations.id })
    .from(signupRegistrations)
    .innerJoin(signupSheets, eq(signupRegistrations.sheetId, signupSheets.id))
    .where(and(
      eq(signupRegistrations.id, input.registrationId),
      eq(signupRegistrations.sheetId, input.sheetId),
      eq(signupRegistrations.status, "active"),
      eq(signupSheets.workspaceId, input.workspaceId),
    ));
  return rows.length ? rows.map((row) => row.id) : null;
}

export async function createSignupSheet(input: {
  workspaceId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  timezone: string;
  maxRegistrationsPerPerson: number;
  questions: SignupQuestion[];
  sessions: {
    title: string;
    description?: string;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }[];
}, executor: Db = getDb()): Promise<SignupSheetRecord> {
  return executor.transaction(async (tx) => {
    const [sheet] = await tx.insert(signupSheets).values({
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      publicId: publicToken(),
      title: input.title,
      description: input.description,
      timezone: input.timezone,
      maxRegistrationsPerPerson: input.maxRegistrationsPerPerson,
      questions: input.questions,
    }).returning();
    if (!sheet) throw new Error("signup sheet insert returned no row");
    await tx.insert(signupSessions).values(input.sessions.map((session) => ({
      sheetId: sheet.id,
      title: session.title,
      description: session.description,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      capacity: session.capacity,
    })));
    return hydrateSheet(sheet, true, tx);
  });
}

export async function listSignupSheets(
  workspaceId: string,
  executor: Db = getDb(),
): Promise<SignupSheetRecord[]> {
  const sheets = await executor.select().from(signupSheets)
    .where(eq(signupSheets.workspaceId, workspaceId))
    .orderBy(desc(signupSheets.createdAt));
  return Promise.all(sheets.map((sheet) => hydrateSheet(sheet, true, executor)));
}

export async function getSignupSheetForWorkspace(
  workspaceId: string,
  sheetId: string,
  executor: Db = getDb(),
): Promise<SignupSheetRecord | null> {
  const [sheet] = await executor.select().from(signupSheets).where(and(
    eq(signupSheets.id, sheetId),
    eq(signupSheets.workspaceId, workspaceId),
  ));
  return sheet ? hydrateSheet(sheet, true, executor) : null;
}

export async function getPublicSignupSheet(
  publicId: string,
  executor: Db = getDb(),
): Promise<SignupSheetRecord | null> {
  const [sheet] = await executor.select().from(signupSheets)
    .where(eq(signupSheets.publicId, publicId));
  return sheet ? hydrateSheet(sheet, false, executor) : null;
}

export async function registerForSignupSessions(input: {
  publicId: string;
  sessionIds: string[];
  name: string;
  email: string;
  answers: Record<string, string>;
}, executor: Db = getDb()): Promise<
  | { registrationIds: string[]; cancelToken: string }
  | "not_found"
  | "closed"
  | "invalid_sessions"
  | "registration_limit"
  | "session_full"
  | "already_registered"
  | "invalid_answers"
  | "missing_answers"
> {
  return executor.transaction(async (tx) => {
    const [sheet] = await tx.select().from(signupSheets)
      .where(eq(signupSheets.publicId, input.publicId))
      .for("update");
    if (!sheet) return "not_found";
    if (sheet.status !== "open") return "closed";
    const sessionIds = [...new Set(input.sessionIds)];
    const sessions = await tx.select().from(signupSessions)
      .where(and(
        eq(signupSessions.sheetId, sheet.id),
        inArray(signupSessions.id, sessionIds),
      ))
      .for("update");
    if (sessions.length !== sessionIds.length) return "invalid_sessions";
    if (sessions.some((session) => session.startsAt.getTime() <= Date.now())) {
      return "invalid_sessions";
    }
    const email = input.email.toLowerCase();
    const existing = await tx.select().from(signupRegistrations).where(and(
      eq(signupRegistrations.sheetId, sheet.id),
      eq(signupRegistrations.email, email),
      eq(signupRegistrations.status, "active"),
    ));
    if (existing.some((row) => sessionIds.includes(row.sessionId))) {
      return "already_registered";
    }
    if (existing.length + sessions.length > sheet.maxRegistrationsPerPerson) {
      return "registration_limit";
    }
    const questionIds = new Set(sheet.questions.map((question) => question.id));
    if (
      Object.keys(input.answers).length > sheet.questions.length
      || Object.keys(input.answers).some((id) => !questionIds.has(id))
    ) return "invalid_answers";
    if (sheet.questions.some(
      (question) => question.required && !input.answers[question.id]?.trim(),
    )) return "missing_answers";
    for (const session of sessions) {
      const [row] = await tx.select({ count: count() }).from(signupRegistrations)
        .where(and(
          eq(signupRegistrations.sessionId, session.id),
          eq(signupRegistrations.status, "active"),
        ));
      if ((row?.count ?? 0) >= session.capacity) return "session_full";
    }
    const cancelToken = generateToken();
    const rows = await tx.insert(signupRegistrations).values(sessions.map((session) => ({
      sheetId: sheet.id,
      sessionId: session.id,
      name: input.name,
      email,
      answers: input.answers,
      cancelToken,
    }))).returning({ id: signupRegistrations.id });
    return { registrationIds: rows.map((row) => row.id), cancelToken };
  });
}

export async function cancelSignupRegistrations(
  cancelToken: string,
  executor: Db = getDb(),
): Promise<boolean> {
  const rows = await executor.update(signupRegistrations).set({ status: "cancelled" })
    .where(and(
      eq(signupRegistrations.cancelToken, cancelToken),
      eq(signupRegistrations.status, "active"),
    ))
    .returning({ id: signupRegistrations.id });
  return rows.length > 0;
}

export async function getSignupConfirmationContext(
  registrationIds: string[],
  executor: Db = getDb(),
) {
  if (registrationIds.length === 0) return null;
  const rows = await executor.select({
    id: signupRegistrations.id,
    name: signupRegistrations.name,
    email: signupRegistrations.email,
    cancelToken: signupRegistrations.cancelToken,
    sheetTitle: signupSheets.title,
    timezone: signupSheets.timezone,
    sessionTitle: signupSessions.title,
    startsAt: signupSessions.startsAt,
    endsAt: signupSessions.endsAt,
  }).from(signupRegistrations)
    .innerJoin(signupSheets, eq(signupRegistrations.sheetId, signupSheets.id))
    .innerJoin(signupSessions, eq(signupRegistrations.sessionId, signupSessions.id))
    .where(and(
      inArray(signupRegistrations.id, registrationIds),
      eq(signupRegistrations.status, "active"),
    ));
  if (rows.length === 0) return null;
  return {
    name: rows[0]!.name,
    email: rows[0]!.email,
    cancelToken: rows[0]!.cancelToken,
    sheetTitle: rows[0]!.sheetTitle,
    timezone: rows[0]!.timezone,
    sessions: rows.map((row) => ({
      id: row.id,
      title: row.sessionTitle,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
  };
}

export async function recordSignupConfirmation(
  registrationIds: string[],
  outcome: { sent: true } | { sent: false; error: string },
  executor: Db = getDb(),
): Promise<void> {
  await executor.update(signupRegistrations).set(outcome.sent
    ? { confirmationSentAt: new Date(), confirmationError: null }
    : { confirmationError: outcome.error.slice(0, 1000) })
    .where(inArray(signupRegistrations.id, registrationIds));
}

export async function markSignupConfirmationPending(
  registrationIds: string[],
  executor: Db = getDb(),
): Promise<void> {
  await executor.update(signupRegistrations).set({
    confirmationSentAt: null,
    confirmationError: null,
  }).where(inArray(signupRegistrations.id, registrationIds));
}

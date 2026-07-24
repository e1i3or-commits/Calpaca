import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "./client";
import * as schema from "./schema";
import { bookingEmailVerifications } from "./schema";
import { generateToken } from "../lib/id";

type Db = NodePgDatabase<typeof schema>;

function secret(): string {
  return process.env.EMAIL_VERIFICATION_SECRET
    ?? process.env.BETTER_AUTH_SECRET
    ?? "development-email-verification-secret";
}

function digest(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export async function createBookingEmailVerification(
  eventTypeId: string,
  email: string,
  executor: Db = getDb(),
): Promise<{ id: string; code: string }> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const [row] = await executor.insert(bookingEmailVerifications).values({
    eventTypeId,
    email: email.trim().toLowerCase(),
    codeHash: digest(code),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  }).returning({ id: bookingEmailVerifications.id });
  if (!row) throw new Error("verification insert returned no row");
  return { id: row.id, code };
}

export async function getActiveBookingEmailChallenge(
  eventTypeId: string,
  email: string,
  executor: Db = getDb(),
): Promise<string | null> {
  const [row] = await executor.select({ id: bookingEmailVerifications.id })
    .from(bookingEmailVerifications)
    .where(and(
      eq(bookingEmailVerifications.eventTypeId, eventTypeId),
      eq(bookingEmailVerifications.email, email.trim().toLowerCase()),
      isNull(bookingEmailVerifications.verifiedAt),
      gt(bookingEmailVerifications.expiresAt, new Date()),
    ))
    .orderBy(desc(bookingEmailVerifications.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function verifyBookingEmailCode(
  id: string,
  code: string,
  executor: Db = getDb(),
): Promise<{ receipt: string } | null> {
  return executor.transaction(async (tx) => {
    const [row] = await tx.select().from(bookingEmailVerifications)
      .where(eq(bookingEmailVerifications.id, id)).for("update");
    if (
      !row
      || row.verifiedAt
      || row.expiresAt <= new Date()
      || row.attempts >= 5
      || !timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(digest(code)))
    ) {
      if (row && !row.verifiedAt && row.attempts < 5) {
        await tx.update(bookingEmailVerifications)
          .set({ attempts: sql`${bookingEmailVerifications.attempts} + 1` })
          .where(eq(bookingEmailVerifications.id, id));
      }
      return null;
    }
    const receipt = generateToken();
    await tx.update(bookingEmailVerifications).set({
      verifiedAt: new Date(),
      receiptHash: digest(receipt),
      receiptExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    }).where(eq(bookingEmailVerifications.id, id));
    return { receipt };
  });
}

export async function validateBookingEmailReceipt(
  eventTypeId: string,
  email: string,
  receipt: string,
  executor: Db = getDb(),
): Promise<boolean> {
  const [row] = await executor.select({ id: bookingEmailVerifications.id })
    .from(bookingEmailVerifications)
    .where(and(
      eq(bookingEmailVerifications.eventTypeId, eventTypeId),
      eq(bookingEmailVerifications.email, email.trim().toLowerCase()),
      eq(bookingEmailVerifications.receiptHash, digest(receipt)),
      gt(bookingEmailVerifications.receiptExpiresAt, new Date()),
    ));
  return Boolean(row);
}

export async function reapBookingEmailVerifications(
  executor: Db = getDb(),
): Promise<number> {
  const now = new Date();
  const rows = await executor.delete(bookingEmailVerifications).where(or(
    and(
      lt(bookingEmailVerifications.expiresAt, new Date(now.getTime() - 30 * 24 * 60 * 60_000)),
      isNull(bookingEmailVerifications.receiptExpiresAt),
    ),
    lt(bookingEmailVerifications.receiptExpiresAt, now),
  )).returning({ id: bookingEmailVerifications.id });
  return rows.length;
}

import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { createAdminRoutes, type AdminDeps } from "../../src/api/routes/admin";
import {
  buildAssignmentExplanation,
  type AssignmentExplanation,
} from "../../src/core/assignment/round-robin";
import { confirmHold, createHold } from "../../src/db/holds-repo";
import { getAssignmentExplanationForUser } from "../../src/db/booking-repo";
import * as schema from "../../src/db/schema";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const slot = {
  start: Temporal.Instant.from("2027-01-04T09:00:00Z"),
  end: Temporal.Instant.from("2027-01-04T09:30:00Z"),
};

function explanation(): AssignmentExplanation {
  const result = buildAssignmentExplanation(
    slot,
    [
      { userId: "host-b", weight: 200 },
      { userId: "host-a", weight: 100 },
      { userId: "host-c", weight: 100 },
    ],
    [
      { userId: "host-a", bookedAt: Temporal.Instant.from("2027-01-01T09:00:00Z") },
      { userId: "host-b", bookedAt: Temporal.Instant.from("2027-01-02T09:00:00Z") },
      { userId: "host-b", bookedAt: Temporal.Instant.from("2027-01-03T09:00:00Z") },
      { userId: "host-c", bookedAt: Temporal.Instant.from("2027-01-04T08:00:00Z") },
    ],
  );
  if (!result) throw new Error("fixture must produce an assignment");
  return result;
}

function deps(
  getAssignment: () => Promise<AssignmentExplanation | null>,
  authenticated = true,
): AdminDeps {
  const requireAuth: AdminDeps["requireAuth"] = authenticated
    ? async (c, next) => {
        c.set("user", { id: USER_ID, email: "host@example.test", name: "Host" });
        await next();
      }
    : async (c) => c.json({ error: "unauthorized" }, 401);

  return {
    requireAuth,
    getAssignmentExplanationForUser: getAssignment,
  } as unknown as AdminDeps;
}

describe("round-robin assignment transparency", () => {
  test("assignment-time snapshot names the booked winner and ranks every candidate", () => {
    const stored = explanation();

    expect(stored.winnerUserId).toBe("host-a");
    expect(stored.reason).toBe("least_recently_booked");
    expect(stored.candidates.map((candidate) => candidate.userId)).toEqual([
      "host-a",
      "host-b",
      "host-c",
    ]);
    expect(stored.candidates).toHaveLength(3);
    expect(stored.candidates[0]?.effectiveLoad).toBe(1);
    expect(stored.candidates[0]?.lastBookedAt).toBe("2027-01-01T09:00:00Z");
  });

  test("authenticated admin endpoint returns the stored explanation", async () => {
    const stored = explanation();
    let lookup: { bookingId: string; userId: string } | undefined;
    const router = createAdminRoutes(
      deps(async () => {
        lookup = { bookingId: BOOKING_ID, userId: USER_ID };
        return stored;
      }),
    );

    const response = await router.request(`/api/me/bookings/${BOOKING_ID}/assignment`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assignment: stored });
    expect(lookup).toEqual({ bookingId: BOOKING_ID, userId: USER_ID });
  });

  test("solo or missing booking yields no_assignment", async () => {
    const router = createAdminRoutes(deps(async () => null));
    const response = await router.request(`/api/me/bookings/${BOOKING_ID}/assignment`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no_assignment" });
  });

  test("unauthenticated access is rejected before lookup", async () => {
    let lookedUp = false;
    const router = createAdminRoutes(
      deps(async () => {
        lookedUp = true;
        return explanation();
      }, false),
    );

    const response = await router.request(`/api/me/bookings/${BOOKING_ID}/assignment`);

    expect(response.status).toBe(401);
    expect(lookedUp).toBe(false);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("round-robin assignment persistence", () => {
  test("confirm writes the winner and complete ranking into the created event", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = drizzle(pool, { schema });

    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      await db.execute(
        sql`truncate table ${schema.holds}, ${schema.bookingEvents}, ${schema.bookings}, ${schema.eventTypeHosts}, ${schema.eventTypes}, ${schema.users} restart identity cascade`,
      );

      const [owner, hostA, hostB, hostC] = await db
        .insert(schema.users)
        .values([
          { email: "owner-assignment@example.test", name: "Owner" },
          { email: "host-a-assignment@example.test", name: "Host A" },
          { email: "host-b-assignment@example.test", name: "Host B" },
          { email: "host-c-assignment@example.test", name: "Host C" },
        ])
        .returning();
      if (!owner || !hostA || !hostB || !hostC) throw new Error("failed to create users");

      const [eventType] = await db
        .insert(schema.eventTypes)
        .values({
          ownerUserId: owner.id,
          slug: "assignment-test",
          title: "Assignment test",
          durationMinutes: 30,
          mode: "round_robin",
        })
        .returning();
      if (!eventType) throw new Error("failed to create event type");

      const held = await createHold(
        eventType.id,
        [hostA.id, hostB.id, hostC.id],
        slot,
        Temporal.Duration.from({ minutes: 10 }),
        db,
      );
      expect(held.ok).toBe(true);
      if (!held.ok) return;

      const confirmed = await confirmHold(
        held.value.map((hold) => hold.id),
        { email: "invitee@example.test", name: "Invitee", timezone: "UTC" },
        db,
        {
          candidates: [
            { userId: hostB.id, weight: 200 },
            { userId: hostA.id, weight: 100 },
            { userId: hostC.id, weight: 100 },
          ],
          history: [
            { userId: hostA.id, bookedAt: Temporal.Instant.from("2027-01-01T09:00:00Z") },
            { userId: hostB.id, bookedAt: Temporal.Instant.from("2027-01-02T09:00:00Z") },
            { userId: hostB.id, bookedAt: Temporal.Instant.from("2027-01-03T09:00:00Z") },
            { userId: hostC.id, bookedAt: Temporal.Instant.from("2027-01-04T08:00:00Z") },
          ],
        },
      );
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;

      const stored = await getAssignmentExplanationForUser(confirmed.value.bookingId, owner.id, db);
      expect(stored?.winnerUserId).toBe(confirmed.value.hostUserIds[0]);
      expect(stored?.candidates).toHaveLength(3);
      expect(stored?.candidates.map((candidate) => candidate.userId)).toEqual([
        hostA.id,
        hostB.id,
        hostC.id,
      ]);

      const [event] = await db
        .select({ payload: schema.bookingEvents.payload })
        .from(schema.bookingEvents)
        .where(eq(schema.bookingEvents.bookingId, confirmed.value.bookingId));
      expect((event?.payload as { assignment?: unknown }).assignment).toEqual(stored);
    } finally {
      await pool.end();
    }
  });
});

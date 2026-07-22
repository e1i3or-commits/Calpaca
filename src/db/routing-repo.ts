import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Condition } from "../core/routing/condition";
import type { RoutingField } from "../core/routing/form";
import { getDb } from "./client";
import * as schema from "./schema";
import { eventTypes, routingForms, routingRules, teamMembers } from "./schema";

type Db = NodePgDatabase<typeof schema>;

// Routing forms + rules. Same scoping rule as the rest of the dashboard:
// owner or member of the form's team. Rules always travel with their form —
// create/update replace the whole rule set (the editor sends it whole).

export interface RoutingRuleRecord {
  readonly id: string;
  readonly priority: number;
  readonly condition: Condition;
  readonly targetEventTypeId: string | null;
  readonly targetHostUserId: string | null;
}

export interface RoutingFormRecord {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly teamId: string | null;
  readonly slug: string;
  readonly fields: readonly RoutingField[];
  readonly rules: readonly RoutingRuleRecord[];
}

export interface RoutingRuleInputRow {
  readonly priority: number;
  readonly condition: Condition;
  readonly targetEventTypeId: string | null;
  readonly targetHostUserId: string | null;
}

export interface RoutingFormInput {
  readonly slug: string;
  readonly teamId: string | null;
  readonly fields: readonly RoutingField[];
  readonly rules: readonly RoutingRuleInputRow[];
}

async function rulesFor(
  executor: Db,
  formIds: readonly string[],
): Promise<Map<string, RoutingRuleRecord[]>> {
  if (formIds.length === 0) return new Map();
  const rows = await executor
    .select()
    .from(routingRules)
    .where(inArray(routingRules.formId, [...formIds]))
    .orderBy(asc(routingRules.priority));
  const byForm = new Map<string, RoutingRuleRecord[]>();
  for (const row of rows) {
    const record: RoutingRuleRecord = {
      id: row.id,
      priority: row.priority,
      condition: row.condition as Condition,
      targetEventTypeId: row.targetEventTypeId,
      targetHostUserId: row.targetHostUserId,
    };
    byForm.set(row.formId, [...(byForm.get(row.formId) ?? []), record]);
  }
  return byForm;
}

function toRecord(
  row: typeof routingForms.$inferSelect,
  rules: readonly RoutingRuleRecord[],
): RoutingFormRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    teamId: row.teamId,
    slug: row.slug,
    fields: row.fields as RoutingField[],
    rules,
  };
}

/** Public read: the form definition plus its rules (the evaluate endpoint
 * needs the rules; the public GET response redacts them at the route). */
export async function getRoutingFormBySlug(
  slug: string,
  executor: Db = getDb(),
): Promise<RoutingFormRecord | null> {
  const [row] = await executor.select().from(routingForms).where(eq(routingForms.slug, slug));
  if (!row) return null;
  const rules = await rulesFor(executor, [row.id]);
  return toRecord(row, rules.get(row.id) ?? []);
}

export async function listRoutingFormsForUser(
  userId: string,
  executor: Db = getDb(),
): Promise<RoutingFormRecord[]> {
  const memberTeams = (
    await executor
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
  ).map((r) => r.teamId);
  const rows = await executor
    .select()
    .from(routingForms)
    .where(
      memberTeams.length > 0
        ? or(eq(routingForms.ownerUserId, userId), inArray(routingForms.teamId, memberTeams))
        : eq(routingForms.ownerUserId, userId),
    );
  const rules = await rulesFor(executor, rows.map((r) => r.id));
  return rows.map((r) => toRecord(r, rules.get(r.id) ?? []));
}

async function getFormForAdmin(id: string, userId: string, executor: Db): Promise<RoutingFormRecord | null> {
  const [row] = await executor.select().from(routingForms).where(eq(routingForms.id, id));
  if (!row) return null;
  const allowed =
    row.ownerUserId === userId ||
    (row.teamId !== null &&
      (
        await executor
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, row.teamId), eq(teamMembers.userId, userId)))
      ).length > 0);
  if (!allowed) return null;
  const rules = await rulesFor(executor, [row.id]);
  return toRecord(row, rules.get(row.id) ?? []);
}

async function insertRules(
  executor: Db,
  formId: string,
  rules: readonly RoutingRuleInputRow[],
): Promise<void> {
  if (rules.length === 0) return;
  await executor.insert(routingRules).values(rules.map((r) => ({ ...r, formId })));
}

export async function createRoutingForm(
  ownerUserId: string,
  input: RoutingFormInput,
  executor: Db = getDb(),
): Promise<RoutingFormRecord | "slug_taken"> {
  return executor.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: routingForms.id })
      .from(routingForms)
      .where(eq(routingForms.slug, input.slug));
    if (existing) return "slug_taken";
    const [row] = await tx
      .insert(routingForms)
      .values({ ownerUserId, teamId: input.teamId, slug: input.slug, fields: input.fields })
      .returning();
    await insertRules(tx, row!.id, input.rules);
    const rules = await rulesFor(tx, [row!.id]);
    return toRecord(row!, rules.get(row!.id) ?? []);
  });
}

export async function updateRoutingForm(
  id: string,
  userId: string,
  input: RoutingFormInput,
  executor: Db = getDb(),
): Promise<RoutingFormRecord | null | "slug_taken"> {
  return executor.transaction(async (tx) => {
    const existing = await getFormForAdmin(id, userId, tx);
    if (!existing) return null;
    if (input.slug !== existing.slug) {
      const [clash] = await tx
        .select({ id: routingForms.id })
        .from(routingForms)
        .where(eq(routingForms.slug, input.slug));
      if (clash) return "slug_taken";
    }
    const [row] = await tx
      .update(routingForms)
      .set({ slug: input.slug, teamId: input.teamId, fields: input.fields })
      .where(eq(routingForms.id, id))
      .returning();
    // replace-all rules, same pattern as event type hosts
    await tx.delete(routingRules).where(eq(routingRules.formId, id));
    await insertRules(tx, id, input.rules);
    const rules = await rulesFor(tx, [id]);
    return toRecord(row!, rules.get(id) ?? []);
  });
}

export async function deleteRoutingForm(
  id: string,
  userId: string,
  executor: Db = getDb(),
): Promise<"deleted" | "not_found"> {
  return executor.transaction(async (tx) => {
    const existing = await getFormForAdmin(id, userId, tx);
    if (!existing) return "not_found";
    await tx.delete(routingRules).where(eq(routingRules.formId, id));
    await tx.delete(routingForms).where(eq(routingForms.id, id));
    return "deleted";
  });
}

/** Resolves a rule's target event type to its public booking slug. */
export async function getEventTypeSlugById(id: string, executor: Db = getDb()): Promise<string | null> {
  const [row] = await executor
    .select({ slug: eventTypes.slug })
    .from(eventTypes)
    .where(eq(eventTypes.id, id));
  return row?.slug ?? null;
}

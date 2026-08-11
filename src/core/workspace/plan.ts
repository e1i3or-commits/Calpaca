import { Temporal } from "@js-temporal/polyfill";
import { entitlementsFor, type WorkspaceEntitlements, type WorkspacePlan } from "./entitlements";

/** What an expired trial falls back to. Not "no access": a beta tester whose
 * year runs out keeps their bookings, links, and history — they just stop
 * getting the paid capabilities. */
export const EXPIRED_PLAN: WorkspacePlan = "free";

export interface WorkspacePlanRecord {
  readonly plan: WorkspacePlan;
  /** ISO instant. null means the plan does not expire — the normal case for
   * both paying customers and self-hosted installations. */
  readonly planExpiresAt: string | null;
}

export interface ResolvedWorkspacePlan {
  /** The plan to enforce right now. */
  readonly plan: WorkspacePlan;
  /** What is stored on the workspace, which differs from `plan` once a trial
   * has lapsed. Kept so the dashboard can say "your Pro trial ended" instead of
   * pretending the workspace was always free. */
  readonly grantedPlan: WorkspacePlan;
  readonly entitlements: WorkspaceEntitlements;
  readonly trial: null | {
    readonly endsAt: string;
    readonly expired: boolean;
    /** Whole days left, rounded up, floored at 0. */
    readonly daysRemaining: number;
  };
}

/** Self-hosted installations are not on a trial clock — an expiry stored
 * against one would be a data error, and honouring it would downgrade someone
 * running their own server. */
function expirable(plan: WorkspacePlan): boolean {
  return plan !== "self_hosted" && plan !== EXPIRED_PLAN;
}

export function resolveWorkspacePlan(
  record: WorkspacePlanRecord,
  now: Temporal.Instant = Temporal.Now.instant(),
): ResolvedWorkspacePlan {
  if (record.planExpiresAt === null || !expirable(record.plan)) {
    return {
      plan: record.plan,
      grantedPlan: record.plan,
      entitlements: entitlementsFor(record.plan),
      trial: null,
    };
  }

  let endsAt: Temporal.Instant;
  try {
    endsAt = Temporal.Instant.from(record.planExpiresAt);
  } catch {
    // An unparseable expiry must not silently grant an unlimited paid plan, and
    // must not silently revoke one either — treat it as no expiry and let the
    // stored plan stand, which is the state an operator can actually see.
    return {
      plan: record.plan,
      grantedPlan: record.plan,
      entitlements: entitlementsFor(record.plan),
      trial: null,
    };
  }

  const expired = Temporal.Instant.compare(endsAt, now) <= 0;
  const effective = expired ? EXPIRED_PLAN : record.plan;
  const hoursRemaining = expired
    ? 0
    : endsAt.since(now, { largestUnit: "hour" }).total({ unit: "hour" });
  return {
    plan: effective,
    grantedPlan: record.plan,
    entitlements: entitlementsFor(effective),
    trial: {
      endsAt: endsAt.toString(),
      expired,
      daysRemaining: Math.max(0, Math.ceil(hoursRemaining / 24)),
    },
  };
}

export const DEFAULT_TRIAL_DAYS = 365;
export const MAX_TRIAL_DAYS = 1095;

/** End of a trial started now. Days rather than an absolute date so the clock
 * starts when the tester actually signs up, not when the grant was written. */
export function trialEndsAt(
  startedAt: Temporal.Instant,
  days: number = DEFAULT_TRIAL_DAYS,
): string {
  return startedAt.add({ hours: Math.round(days * 24) }).toString();
}

/**
 * Grants a Cloud Pro (or Business) trial to a beta tester by email.
 *
 * Two cases, handled the same way from the caller's side:
 *   - They already have an account: the workspace they own is upgraded now and
 *     the trial clock starts today.
 *   - They have not signed up yet: the grant is recorded and applied
 *     automatically the moment they first sign in, so the clock starts when
 *     they actually begin using it rather than when you sent the invitation.
 *
 * Usage (from the repo root, against whichever DATABASE_URL you mean to touch):
 *   bun run scripts-dev/grant-trial.ts grant kai@example.com
 *   bun run scripts-dev/grant-trial.ts grant kai@example.com --plan business --days 90
 *   bun run scripts-dev/grant-trial.ts grant kai@example.com --note "beta wave 1"
 *   bun run scripts-dev/grant-trial.ts list
 *   bun run scripts-dev/grant-trial.ts revoke kai@example.com
 *
 * Prints no secrets. Safe to re-run: re-granting the same address replaces the
 * earlier pending promise instead of stacking a second trial.
 */
import { Temporal } from "@js-temporal/polyfill";
import type { WorkspacePlan } from "../src/core/workspace/entitlements";
import { DEFAULT_TRIAL_DAYS, MAX_TRIAL_DAYS, resolveWorkspacePlan } from "../src/core/workspace/plan";
import { getDb } from "../src/db/client";
import {
  claimPlanGrant,
  findOwnedWorkspace,
  listPlanGrants,
  revokePlanGrant,
  upsertPlanGrant,
} from "../src/db/plan-grant-repo";

const GRANTABLE: readonly WorkspacePlan[] = ["pro", "business"];

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function usage(message: string): never {
  console.error(`error: ${message}`);
  console.error("usage: grant-trial.ts grant <email> [--plan pro|business] [--days N] [--note text]");
  console.error("       grant-trial.ts list");
  console.error("       grant-trial.ts revoke <email>");
  process.exit(1);
}

const command = process.argv[2];
const db = getDb();

if (command === "list") {
  const grants = await listPlanGrants(db);
  if (grants.length === 0) {
    console.log("no trials granted yet");
  }
  for (const grant of grants) {
    const expiry = grant.planExpiresAt
      ? resolveWorkspacePlan({
          plan: grant.plan,
          planExpiresAt: grant.planExpiresAt.toISOString(),
        })
      : null;
    const remaining = expiry?.trial
      ? expiry.trial.expired
        ? "EXPIRED"
        : `${expiry.trial.daysRemaining}d left`
      : "not started";
    console.log(
      [
        grant.email.padEnd(34),
        grant.plan.padEnd(9),
        grant.status.padEnd(8),
        `${grant.trialDays}d`.padEnd(6),
        remaining.padEnd(12),
        grant.claimedWorkspaceSlug ?? "-",
        grant.note ? `(${grant.note})` : "",
      ].join(" "),
    );
  }
  process.exit(0);
}

if (command === "revoke") {
  const email = process.argv[3];
  if (!email) usage("revoke needs an email");
  const revoked = await revokePlanGrant(email, db);
  console.log(
    revoked > 0
      ? `revoked ${revoked} pending grant(s) for ${email}`
      : `no pending grant for ${email} (an already-claimed trial is on the workspace; change its plan directly)`,
  );
  process.exit(0);
}

if (command !== "grant") usage(`unknown command ${command ?? "(none)"}`);

const email = process.argv[3];
if (!email || !email.includes("@")) usage("grant needs an email address");

const plan = (flag("plan") ?? "pro") as WorkspacePlan;
if (!GRANTABLE.includes(plan)) usage(`--plan must be one of ${GRANTABLE.join(", ")}`);

const days = Number(flag("days") ?? DEFAULT_TRIAL_DAYS);
if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_DAYS) {
  usage(`--days must be a whole number between 1 and ${MAX_TRIAL_DAYS}`);
}

const note = flag("note") ?? null;

const grant = await upsertPlanGrant({ email, plan, trialDays: days, note }, db);
console.log(`recorded ${plan} trial of ${days} days for ${grant.email}`);

// Apply immediately when they already have a workspace of their own, so an
// existing account does not have to sign out and back in to see the upgrade.
const owned = await findOwnedWorkspace(email, db);
if (!owned) {
  console.log("they have no account yet — the trial applies automatically at first sign-in");
  process.exit(0);
}

const applied = await claimPlanGrant(
  { userId: owned.userId, email, workspaceId: owned.workspaceId },
  Temporal.Now.instant(),
  db,
);
if (!applied) {
  console.log(`could not apply the grant to workspace ${owned.slug} — check 'list'`);
  process.exit(1);
}
console.log(
  `applied to workspace ${owned.slug}: ${applied.plan} until ${applied.expiresAt}`,
);
process.exit(0);

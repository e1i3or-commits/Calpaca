ALTER TABLE "users" ADD COLUMN "onboarding_step" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
-- Every user that exists when this migration runs predates the first-run
-- wizard and already has a working setup. Without this backfill they would all
-- be redirected into onboarding on their next sign-in, because an unanswered
-- profile step is indistinguishable from a never-started one.
UPDATE "users"
SET "onboarding_step" = 'publish',
    "onboarding_completed_at" = now()
WHERE "onboarding_completed_at" IS NULL;
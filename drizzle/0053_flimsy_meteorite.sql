CREATE TYPE "public"."plan_grant_status" AS ENUM('pending', 'claimed', 'revoked');--> statement-breakpoint
CREATE TABLE "plan_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"plan" "workspace_plan" NOT NULL,
	"trial_days" integer NOT NULL,
	"status" "plan_grant_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"granted_by_user_id" uuid,
	"claimed_by_user_id" uuid,
	"claimed_workspace_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_grants" ADD CONSTRAINT "plan_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_grants" ADD CONSTRAINT "plan_grants_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_grants" ADD CONSTRAINT "plan_grants_claimed_workspace_id_workspaces_id_fk" FOREIGN KEY ("claimed_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_plan_grant_email_uq" ON "plan_grants" USING btree (lower("email")) WHERE status = 'pending';
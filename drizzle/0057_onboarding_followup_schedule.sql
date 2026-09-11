CREATE TABLE "onboarding_followup_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_followup_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"exception" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_followup_schedules" (
	"onboarding_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"rule" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_followup_changes" ADD CONSTRAINT "onboarding_followup_changes_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followup_changes" ADD CONSTRAINT "onboarding_followup_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followup_occurrences" ADD CONSTRAINT "onboarding_followup_occurrences_onboarding_id_onboarding_followup_schedules_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboarding_followup_schedules"("onboarding_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD CONSTRAINT "onboarding_followup_schedules_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_followup_request_uq" ON "onboarding_followup_changes" USING btree ("onboarding_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_followup_revision_uq" ON "onboarding_followup_changes" USING btree ("onboarding_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_followup_position_uq" ON "onboarding_followup_occurrences" USING btree ("onboarding_id","position");
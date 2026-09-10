CREATE TABLE "franchise_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_workspace_id" uuid NOT NULL,
	"source_project_key" text NOT NULL,
	"engagement_id" uuid NOT NULL,
	"franchisee_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"attendance" jsonb NOT NULL,
	"cadence" text DEFAULT 'biweekly' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_onboarding_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"cadence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "franchise_onboarding" ADD CONSTRAINT "franchise_onboarding_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_onboarding" ADD CONSTRAINT "franchise_onboarding_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_onboarding_changes" ADD CONSTRAINT "franchise_onboarding_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_onboarding_changes" ADD CONSTRAINT "franchise_onboarding_changes_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_onboarding_changes" ADD CONSTRAINT "franchise_onboarding_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_onboarding_source_uq" ON "franchise_onboarding" USING btree ("workspace_id","source_workspace_id","source_project_key");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_onboarding_engagement_uq" ON "franchise_onboarding" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "franchise_onboarding_franchisee_idx" ON "franchise_onboarding" USING btree ("workspace_id","franchisee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_onboarding_change_revision_uq" ON "franchise_onboarding_changes" USING btree ("onboarding_id","revision");
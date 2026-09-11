CREATE TABLE "onboarding_scheduling_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"revision" integer NOT NULL,
	"input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_scheduling_actions" ADD CONSTRAINT "onboarding_scheduling_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_scheduling_actions" ADD CONSTRAINT "onboarding_scheduling_actions_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_scheduling_actions" ADD CONSTRAINT "onboarding_scheduling_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_scheduling_request_uq" ON "onboarding_scheduling_actions" USING btree ("workspace_id","request_id");
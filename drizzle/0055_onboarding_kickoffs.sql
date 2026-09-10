CREATE TABLE "onboarding_kickoffs" (
	"onboarding_id" uuid PRIMARY KEY NOT NULL,
	"event_type_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding_kickoffs" ADD CONSTRAINT "onboarding_kickoffs_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_kickoffs" ADD CONSTRAINT "onboarding_kickoffs_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_kickoffs" ADD CONSTRAINT "onboarding_kickoffs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_kickoff_event_type_uq" ON "onboarding_kickoffs" USING btree ("event_type_id");
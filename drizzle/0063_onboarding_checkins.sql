CREATE TABLE "onboarding_checkins" (
	"onboarding_id" uuid PRIMARY KEY NOT NULL,
	"event_type_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding_checkins" ADD CONSTRAINT "onboarding_checkins_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checkins" ADD CONSTRAINT "onboarding_checkins_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checkins" ADD CONSTRAINT "onboarding_checkins_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_checkin_event_type_uq" ON "onboarding_checkins" USING btree ("event_type_id");
ALTER TYPE "public"."booking_event_kind" ADD VALUE 'invitee_changed';--> statement-breakpoint
CREATE TABLE "onboarding_contact_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"previous" jsonb NOT NULL,
	"next" jsonb NOT NULL,
	"booking_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "franchise_onboarding" ADD COLUMN "client_contact" jsonb;--> statement-breakpoint
ALTER TABLE "onboarding_contact_changes" ADD CONSTRAINT "onboarding_contact_changes_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_contact_changes" ADD CONSTRAINT "onboarding_contact_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_contact_change_request_uq" ON "onboarding_contact_changes" USING btree ("onboarding_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_contact_change_revision_uq" ON "onboarding_contact_changes" USING btree ("onboarding_id","revision");
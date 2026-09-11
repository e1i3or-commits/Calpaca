CREATE TABLE "followup_reservation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"issue_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followup_reservations" (
	"occurrence_id" uuid PRIMARY KEY NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"booking_id" uuid,
	"status" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"issue_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "followup_reservations_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_followups" (
	"onboarding_id" uuid PRIMARY KEY NOT NULL,
	"event_type_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled_at" timestamp with time zone,
	"approved_revision" integer,
	"kickoff_booking_id" uuid,
	CONSTRAINT "onboarding_followups_event_type_id_unique" UNIQUE("event_type_id")
);
--> statement-breakpoint
ALTER TABLE "followup_reservation_events" ADD CONSTRAINT "followup_reservation_events_occurrence_id_followup_reservations_occurrence_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."followup_reservations"("occurrence_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_reservation_events" ADD CONSTRAINT "followup_reservation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_reservations" ADD CONSTRAINT "followup_reservations_occurrence_id_onboarding_followup_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."onboarding_followup_occurrences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_reservations" ADD CONSTRAINT "followup_reservations_onboarding_id_onboarding_followups_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboarding_followups"("onboarding_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_reservations" ADD CONSTRAINT "followup_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_reservations" ADD CONSTRAINT "followup_reservations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followups" ADD CONSTRAINT "onboarding_followups_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followups" ADD CONSTRAINT "onboarding_followups_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followups" ADD CONSTRAINT "onboarding_followups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followups" ADD CONSTRAINT "onboarding_followups_kickoff_booking_id_bookings_id_fk" FOREIGN KEY ("kickoff_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
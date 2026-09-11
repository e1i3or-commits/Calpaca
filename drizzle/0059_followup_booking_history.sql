CREATE TABLE "followup_booking_history" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "followup_booking_history" ADD CONSTRAINT "followup_booking_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_booking_history" ADD CONSTRAINT "followup_booking_history_occurrence_id_onboarding_followup_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."onboarding_followup_occurrences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO followup_booking_history (booking_id, occurrence_id, revision)
SELECT r.booking_id, r.occurrence_id, f.revision
FROM followup_reservations r JOIN franchise_onboarding f ON f.id = r.onboarding_id
WHERE r.booking_id IS NOT NULL ON CONFLICT DO NOTHING;

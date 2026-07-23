CREATE TABLE "time_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type_id" uuid NOT NULL,
	"invitee_email" text NOT NULL,
	"invitee_name" text NOT NULL,
	"invitee_timezone" text NOT NULL,
	"proposed_slots" jsonb NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_suggestions" ADD CONSTRAINT "time_suggestions_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meeting_polls" ADD COLUMN "results_visibility" text DEFAULT 'after_response' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD COLUMN "deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD COLUMN "allow_response_editing" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD COLUMN "participant_limit" integer;
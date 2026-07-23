ALTER TABLE "meeting_poll_participants" ADD COLUMN "finalization_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_poll_participants" ADD COLUMN "finalization_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_poll_participants" ADD COLUMN "finalization_error" text;
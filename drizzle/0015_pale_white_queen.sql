ALTER TABLE "bookings" ADD COLUMN "meeting_format" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "invitee_phone" text;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "meeting_formats" jsonb DEFAULT '["google_meet"]'::jsonb NOT NULL;
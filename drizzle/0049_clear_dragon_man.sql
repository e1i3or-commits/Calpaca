ALTER TABLE "bookings" ADD COLUMN "guest_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "guests_enabled" boolean DEFAULT false NOT NULL;
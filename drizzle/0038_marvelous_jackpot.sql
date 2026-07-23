ALTER TABLE "bookings" ADD COLUMN "booking_location" jsonb;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "locations" jsonb DEFAULT '[]'::jsonb NOT NULL;
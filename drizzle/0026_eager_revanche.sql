ALTER TABLE "bookings" ALTER COLUMN "workspace_id" SET DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ALTER COLUMN "workspace_id" SET DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "routing_forms" ALTER COLUMN "workspace_id" SET DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ALTER COLUMN "workspace_id" SET DEFAULT NULL;
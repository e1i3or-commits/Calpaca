ALTER TABLE "routing_forms" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "routing_forms" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "routing_forms" ADD COLUMN "theme" text DEFAULT 'default' NOT NULL;
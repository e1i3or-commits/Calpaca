CREATE TYPE "public"."playbook_status" AS ENUM('draft', 'ready', 'retired');--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "playbook_status" "playbook_status" DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "participant_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "preparation_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "outcome_definition" text;--> statement-breakpoint
CREATE INDEX "event_type_engagement_idx" ON "event_types" USING btree ("engagement_id");
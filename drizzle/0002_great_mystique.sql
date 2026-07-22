ALTER TABLE "calendar_connections" ADD COLUMN "channel_resource_id" text;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "channel_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "busy_event_uq" ON "calendar_busy_cache" USING btree ("connection_id","external_event_id") WHERE external_event_id is not null;
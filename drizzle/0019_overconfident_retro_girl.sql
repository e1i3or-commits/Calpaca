ALTER TABLE "calendar_connections" ADD COLUMN "conflict_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "is_write_destination" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_write_destination_uq" ON "calendar_connections" USING btree ("user_id") WHERE is_write_destination = true;
DROP INDEX "active_hold_uq";--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "capacity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "active_hold_slot_idx" ON "holds" USING btree ("event_type_id","slot_start") WHERE status = 'active';
ALTER TABLE "routing_forms" DROP CONSTRAINT "routing_forms_slug_unique";--> statement-breakpoint
DROP INDEX "event_type_slug_uq";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "routing_forms" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_forms" ADD CONSTRAINT "routing_forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_workspace_slug_uq" ON "event_types" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_form_workspace_slug_uq" ON "routing_forms" USING btree ("workspace_id","slug");
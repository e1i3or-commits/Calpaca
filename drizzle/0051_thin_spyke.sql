CREATE TABLE "event_type_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "event_type_folders" ADD CONSTRAINT "event_type_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_folder_workspace_name_uq" ON "event_type_folders" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_folder_id_event_type_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."event_type_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_type_folder_idx" ON "event_types" USING btree ("workspace_id","folder_id");
ALTER TABLE "workspaces" ADD COLUMN "us_holidays" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_closed_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_closed_days_range_ck" CHECK ("end_date" >= "start_date")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_closed_days" ADD CONSTRAINT "workspace_closed_days_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_closed_day_workspace_idx" ON "workspace_closed_days" USING btree ("workspace_id","start_date");

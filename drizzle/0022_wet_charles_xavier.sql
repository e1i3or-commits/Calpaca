ALTER TABLE "teams" DROP CONSTRAINT "teams_slug_unique";--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_workspace_slug_uq" ON "teams" USING btree ("workspace_id","slug");
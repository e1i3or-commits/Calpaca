CREATE TYPE "public"."engagement_status" AS ENUM('draft', 'potential', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('project', 'retainer', 'discovery', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."engagement_visibility" AS ENUM('workspace', 'restricted');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_people" (
	"engagement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_people_engagement_id_user_id_pk" PRIMARY KEY("engagement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "engagement_type" DEFAULT 'project' NOT NULL,
	"status" "engagement_status" DEFAULT 'draft' NOT NULL,
	"visibility" "engagement_visibility" DEFAULT 'workspace' NOT NULL,
	"account_lead_user_id" uuid NOT NULL,
	"expected_end_date" date,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "engagement_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_people" ADD CONSTRAINT "engagement_people_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_people" ADD CONSTRAINT "engagement_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_account_lead_user_id_users_id_fk" FOREIGN KEY ("account_lead_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_workspace_normalized_name_uq" ON "clients" USING btree ("workspace_id","normalized_name");--> statement-breakpoint
CREATE INDEX "client_workspace_name_idx" ON "clients" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "engagement_person_user_idx" ON "engagement_people" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "engagement_workspace_status_idx" ON "engagements" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "engagement_client_idx" ON "engagements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "engagement_account_lead_idx" ON "engagements" USING btree ("account_lead_user_id");--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;
CREATE TABLE "signup_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cancel_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"confirmation_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"max_registrations_per_person" integer DEFAULT 1 NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_sheets_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "signup_registrations" ADD CONSTRAINT "signup_registrations_sheet_id_signup_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."signup_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_registrations" ADD CONSTRAINT "signup_registrations_session_id_signup_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."signup_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_sessions" ADD CONSTRAINT "signup_sessions_sheet_id_signup_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."signup_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_sheets" ADD CONSTRAINT "signup_sheets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_sheets" ADD CONSTRAINT "signup_sheets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signup_registration_session_email_uq" ON "signup_registrations" USING btree ("session_id","email") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "signup_registration_sheet_idx" ON "signup_registrations" USING btree ("sheet_id","created_at");--> statement-breakpoint
CREATE INDEX "signup_registration_cancel_idx" ON "signup_registrations" USING btree ("cancel_token");--> statement-breakpoint
CREATE INDEX "signup_session_sheet_idx" ON "signup_sessions" USING btree ("sheet_id","starts_at");--> statement-breakpoint
CREATE INDEX "signup_sheet_workspace_idx" ON "signup_sheets" USING btree ("workspace_id","created_at");
CREATE TABLE "meeting_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_poll_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"edit_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_poll_participants_edit_token_hash_unique" UNIQUE("edit_token_hash")
);
--> statement-breakpoint
CREATE TABLE "meeting_poll_votes" (
	"participant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"choice" text NOT NULL,
	CONSTRAINT "meeting_poll_votes_participant_id_option_id_pk" PRIMARY KEY("participant_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"finalized_option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_polls_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "meeting_poll_options" ADD CONSTRAINT "meeting_poll_options_poll_id_meeting_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."meeting_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll_participants" ADD CONSTRAINT "meeting_poll_participants_poll_id_meeting_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."meeting_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll_votes" ADD CONSTRAINT "meeting_poll_votes_participant_id_meeting_poll_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."meeting_poll_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll_votes" ADD CONSTRAINT "meeting_poll_votes_option_id_meeting_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."meeting_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD CONSTRAINT "meeting_polls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD CONSTRAINT "meeting_polls_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_poll_option_poll_idx" ON "meeting_poll_options" USING btree ("poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_poll_participant_email_uq" ON "meeting_poll_participants" USING btree ("poll_id","email");--> statement-breakpoint
CREATE INDEX "meeting_poll_vote_option_idx" ON "meeting_poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "meeting_poll_workspace_idx" ON "meeting_polls" USING btree ("workspace_id","created_at");
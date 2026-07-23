CREATE TABLE "invitee_calendar_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"capability_hash" text,
	"return_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"busy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitee_calendar_sessions_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "invitee_calendar_sessions_capability_hash_unique" UNIQUE("capability_hash")
);
--> statement-breakpoint
CREATE INDEX "invitee_calendar_expiry_idx" ON "invitee_calendar_sessions" USING btree ("expires_at");
CREATE TABLE "meeting_poll_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invitation_sent_at" timestamp with time zone,
	"reminder_24_sent_at" timestamp with time zone,
	"reminder_1_sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD COLUMN "reminder_24_hours" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_polls" ADD COLUMN "reminder_1_hour" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_poll_invites" ADD CONSTRAINT "meeting_poll_invites_poll_id_meeting_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."meeting_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_poll_invite_email_uq" ON "meeting_poll_invites" USING btree ("poll_id","email");--> statement-breakpoint
CREATE INDEX "meeting_poll_invite_poll_idx" ON "meeting_poll_invites" USING btree ("poll_id");
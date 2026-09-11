CREATE TABLE "ses_feedback_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kickoff_deliveries" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "ses_feedback_notifications" ADD CONSTRAINT "ses_feedback_notifications_delivery_id_kickoff_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."kickoff_deliveries"("id") ON DELETE no action ON UPDATE no action;
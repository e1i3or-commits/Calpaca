CREATE TABLE "kickoff_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" serial NOT NULL,
	"workspace_id" uuid NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"source_event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"recipients" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"calendar_id" text,
	"google_event_id" text NOT NULL,
	"calendar_verified_at" timestamp with time zone,
	"mail_started_at" timestamp with time zone,
	"mail_accepted_at" timestamp with time zone,
	"attempt_id" uuid,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"issue_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kickoff_deliveries_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "kickoff_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text,
	"attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kickoff_delivery_receipts" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kickoff_delivery_worker" (
	"name" text PRIMARY KEY NOT NULL,
	"last_sweep_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kickoff_deliveries" ADD CONSTRAINT "kickoff_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_deliveries" ADD CONSTRAINT "kickoff_deliveries_onboarding_id_franchise_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."franchise_onboarding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_deliveries" ADD CONSTRAINT "kickoff_deliveries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_deliveries" ADD CONSTRAINT "kickoff_deliveries_source_event_id_booking_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."booking_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_deliveries" ADD CONSTRAINT "kickoff_deliveries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_delivery_events" ADD CONSTRAINT "kickoff_delivery_events_delivery_id_kickoff_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."kickoff_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kickoff_delivery_receipts" ADD CONSTRAINT "kickoff_delivery_receipts_delivery_id_kickoff_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."kickoff_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kickoff_delivery_source_uq" ON "kickoff_deliveries" USING btree ("source_event_id","kind");--> statement-breakpoint
CREATE INDEX "kickoff_delivery_queue_idx" ON "kickoff_deliveries" USING btree ("status","next_attempt_at");
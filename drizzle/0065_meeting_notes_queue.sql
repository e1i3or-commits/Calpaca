CREATE TABLE "meeting_notes_jobs" (
	"workspace_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_issue" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "meeting_notes_jobs_workspace_id_booking_id_pk" PRIMARY KEY("workspace_id","booking_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_notes_workers" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_notes_jobs" ADD CONSTRAINT "meeting_notes_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes_jobs" ADD CONSTRAINT "meeting_notes_jobs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes_workers" ADD CONSTRAINT "meeting_notes_workers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_notes_jobs_due_idx" ON "meeting_notes_jobs" USING btree ("workspace_id","next_attempt_at","booking_id") WHERE "meeting_notes_jobs"."completed_at" is null;
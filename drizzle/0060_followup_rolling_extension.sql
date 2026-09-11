CREATE TABLE "followup_scheduler_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"issue_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD COLUMN "next_recurrence_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD COLUMN "extension_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD COLUMN "extension_issue_code" text;--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD COLUMN "extension_issue_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD COLUMN "extension_owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "followup_scheduler_events" ADD CONSTRAINT "followup_scheduler_events_onboarding_id_onboarding_followup_schedules_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboarding_followup_schedules"("onboarding_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_scheduler_events" ADD CONSTRAINT "followup_scheduler_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_scheduler_events" ADD CONSTRAINT "followup_scheduler_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_followup_schedules" ADD CONSTRAINT "onboarding_followup_schedules_extension_owner_user_id_users_id_fk" FOREIGN KEY ("extension_owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE onboarding_followup_schedules AS schedule
SET next_recurrence_index = GREATEST(
  (schedule.rule->>'count')::integer,
  COALESCE((SELECT max(item.ordinality)::integer
    FROM onboarding_followup_changes AS change
    CROSS JOIN LATERAL jsonb_array_elements(change.changes) WITH ORDINALITY AS item(value, ordinality)
    WHERE change.onboarding_id=schedule.onboarding_id
      AND change.revision=(SELECT max(latest.revision) FROM onboarding_followup_changes latest
        WHERE latest.onboarding_id=schedule.onboarding_id AND latest.input->'command'->>'action'='configure')
      AND item.value->>'action'<>'cancel'),0)
);

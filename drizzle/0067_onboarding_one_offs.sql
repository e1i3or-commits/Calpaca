CREATE TABLE onboarding_one_offs (
 event_type_id uuid PRIMARY KEY REFERENCES event_types(id),
 onboarding_id uuid NOT NULL REFERENCES franchise_onboarding(id),
 request_id uuid NOT NULL,
 title text NOT NULL,
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 180 AND duration_minutes % 5 = 0),
 attendees jsonb NOT NULL,
 organizer_user_id uuid NOT NULL REFERENCES users(id),
 created_by_user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX onboarding_one_off_request_uq ON onboarding_one_offs(onboarding_id,request_id);

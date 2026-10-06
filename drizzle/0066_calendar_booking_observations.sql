CREATE TABLE booking_calendar_observations (booking_id uuid PRIMARY KEY REFERENCES bookings(id), provider_updated_at timestamptz NOT NULL, etag text NOT NULL, observed_at timestamptz NOT NULL);

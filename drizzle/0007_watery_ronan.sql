ALTER TABLE "bookings" ADD COLUMN "invite_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
-- backfill the projection from the event log: the latest invite_* event wins
UPDATE "bookings" b SET "invite_status" = sub.status
FROM (
  SELECT DISTINCT ON (booking_id) booking_id,
    CASE kind
      WHEN 'invite_sent' THEN 'sent'
      WHEN 'invite_delivered' THEN 'delivered'
      WHEN 'invite_failed' THEN 'failed'
    END AS status
  FROM "booking_events"
  WHERE kind IN ('invite_sent', 'invite_delivered', 'invite_failed')
  ORDER BY booking_id, created_at DESC
) sub
WHERE b.id = sub.booking_id;
CREATE VIEW "analytics_booking_outcomes" AS
WITH final_outcomes AS (
  SELECT
    b.id,
    b.event_type_id,
    b.starts_at,
    CASE
      WHEN bool_or(be.kind = 'no_show') THEN 'no_show'
      WHEN bool_or(be.kind = 'cancelled') THEN 'cancelled'
      ELSE 'confirmed'
    END AS final_status
  FROM bookings b
  JOIN booking_events be ON be.booking_id = b.id
  GROUP BY b.id, b.event_type_id, b.starts_at
)
SELECT
  fo.event_type_id,
  et.slug AS event_type_slug,
  date_trunc('month', fo.starts_at AT TIME ZONE 'UTC') AS calendar_month_utc,
  fo.final_status,
  count(*)::bigint AS booking_count
FROM final_outcomes fo
JOIN event_types et ON et.id = fo.event_type_id
GROUP BY fo.event_type_id, et.slug, calendar_month_utc, fo.final_status;
--> statement-breakpoint

CREATE VIEW "analytics_no_show_rate" AS
WITH completed AS (
  SELECT
    b.id,
    b.event_type_id,
    bool_or(be.kind = 'no_show') AS is_no_show,
    bool_or(be.kind = 'cancelled') AS is_cancelled
  FROM bookings b
  JOIN booking_events be ON be.booking_id = b.id
  WHERE b.starts_at < now()
  GROUP BY b.id, b.event_type_id
)
SELECT
  c.event_type_id,
  et.slug AS event_type_slug,
  count(*) FILTER (WHERE NOT c.is_cancelled)::bigint AS completed_count,
  count(*) FILTER (WHERE c.is_no_show AND NOT c.is_cancelled)::bigint AS no_show_count,
  (
    count(*) FILTER (WHERE c.is_no_show AND NOT c.is_cancelled)::numeric
    / NULLIF(count(*) FILTER (WHERE NOT c.is_cancelled), 0)
  ) AS no_show_rate
FROM completed c
JOIN event_types et ON et.id = c.event_type_id
GROUP BY c.event_type_id, et.slug
HAVING count(*) FILTER (WHERE NOT c.is_cancelled) > 0;
--> statement-breakpoint

CREATE VIEW "analytics_lead_time" AS
SELECT
  b.id AS booking_id,
  b.event_type_id,
  et.slug AS event_type_slug,
  created.created_at AS booked_at,
  b.starts_at,
  b.starts_at - created.created_at AS lead_time
FROM bookings b
JOIN event_types et ON et.id = b.event_type_id
JOIN LATERAL (
  SELECT be.created_at
  FROM booking_events be
  WHERE be.booking_id = b.id AND be.kind = 'created'
  ORDER BY be.created_at, be.id
  LIMIT 1
) created ON true;
--> statement-breakpoint

CREATE VIEW "analytics_rr_distribution" AS
WITH assigned AS (
  SELECT
    b.event_type_id,
    host.value::uuid AS host_user_id,
    count(*)::bigint AS booking_count
  FROM bookings b
  JOIN event_types et ON et.id = b.event_type_id AND et.mode = 'round_robin'
  CROSS JOIN LATERAL jsonb_array_elements_text(b.host_user_ids) host(value)
  GROUP BY b.event_type_id, host.value
),
totals AS (
  SELECT event_type_id, sum(booking_count)::numeric AS total_bookings
  FROM assigned
  GROUP BY event_type_id
),
weights AS (
  SELECT
    eth.event_type_id,
    eth.user_id AS host_user_id,
    eth.weight,
    sum(eth.weight) OVER (PARTITION BY eth.event_type_id)::numeric AS total_weight
  FROM event_type_hosts eth
  JOIN event_types et ON et.id = eth.event_type_id AND et.mode = 'round_robin'
)
SELECT
  w.event_type_id,
  et.slug AS event_type_slug,
  w.host_user_id,
  u.name AS host_name,
  u.email AS host_email,
  w.weight,
  coalesce(a.booking_count, 0::bigint) AS booking_count,
  coalesce(a.booking_count / NULLIF(t.total_bookings, 0), 0::numeric) AS booking_share,
  w.weight / NULLIF(w.total_weight, 0) AS weight_share
FROM weights w
JOIN event_types et ON et.id = w.event_type_id
JOIN users u ON u.id = w.host_user_id
LEFT JOIN assigned a
  ON a.event_type_id = w.event_type_id AND a.host_user_id = w.host_user_id
LEFT JOIN totals t ON t.event_type_id = w.event_type_id;

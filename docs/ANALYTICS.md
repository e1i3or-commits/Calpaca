# Analytics views

Calpaca exposes four ordinary PostgreSQL views for reporting tools and direct
SQL use. They are intentionally not materialized: the append-only
`booking_events` log determines booking outcomes, while `bookings` supplies
stable booking dimensions such as event type, scheduled time, and assigned
hosts. This keeps analytics correct even if the mutable booking projection's
status drifts.

## `analytics_booking_outcomes`

One row per event type, UTC calendar month, and final status.

| Column | Meaning |
| --- | --- |
| `event_type_id`, `event_type_slug` | Event type identity |
| `calendar_month_utc` | Month containing the scheduled start, truncated in UTC |
| `final_status` | `confirmed`, `cancelled`, or `no_show`, derived from events |
| `booking_count` | Bookings in the group |

```sql
SELECT calendar_month_utc, final_status, sum(booking_count)
FROM analytics_booking_outcomes
GROUP BY calendar_month_utc, final_status
ORDER BY calendar_month_utc, final_status;
```

## `analytics_no_show_rate`

One row per event type with at least one completed, non-cancelled meeting.
Future meetings and cancelled meetings are excluded from the denominator.

| Column | Meaning |
| --- | --- |
| `event_type_id`, `event_type_slug` | Event type identity |
| `completed_count` | Past, non-cancelled meetings |
| `no_show_count` | Completed meetings carrying a `no_show` event |
| `no_show_rate` | `no_show_count / completed_count` as a numeric value |

```sql
SELECT event_type_slug, completed_count, no_show_count, no_show_rate
FROM analytics_no_show_rate
ORDER BY no_show_rate DESC;
```

## `analytics_lead_time`

One row per booking. Lead time remains row-level so consumers can choose the
aggregation and percentile method appropriate to their reporting system.

| Column | Meaning |
| --- | --- |
| `booking_id` | Booking identity |
| `event_type_id`, `event_type_slug` | Event type identity |
| `booked_at` | Timestamp of the first `created` event |
| `starts_at` | Scheduled meeting start |
| `lead_time` | PostgreSQL interval from creation to scheduled start |

```sql
SELECT event_type_slug, percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_time)
FROM analytics_lead_time
GROUP BY event_type_slug;
```

## `analytics_rr_distribution`

One row per configured host on a round-robin event type, including hosts with
zero bookings. Comparing booking share with configured weight share makes
assignment fairness visible.

| Column | Meaning |
| --- | --- |
| `event_type_id`, `event_type_slug` | Round-robin event type identity |
| `host_user_id`, `host_name`, `host_email` | Host identity |
| `weight` | Configured integer assignment weight |
| `booking_count` | Bookings assigned to the host |
| `booking_share` | Host bookings divided by total event-type bookings |
| `weight_share` | Host weight divided by total configured weight |

```sql
SELECT event_type_slug, host_email, booking_share, weight_share,
       booking_share - weight_share AS share_delta
FROM analytics_rr_distribution
ORDER BY event_type_slug, share_delta DESC;
```

## Funnel gap

There is no booking-funnel view. Calpaca does not currently capture page-view
or slot-view impressions, so page views → slot views → bookings/drop-off
cannot be calculated honestly. Adding client-side impression tracking is a
separate product decision and is not implied by these views.

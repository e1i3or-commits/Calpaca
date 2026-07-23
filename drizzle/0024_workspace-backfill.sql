INSERT INTO "workspaces" ("name", "slug", "plan")
SELECT 'Calpaca', 'default', 'self_hosted'
WHERE NOT EXISTS (SELECT 1 FROM "workspaces");--> statement-breakpoint

INSERT INTO "workspace_members" ("workspace_id", "user_id", "role", "status")
SELECT
  (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1),
  "id",
  "app_role",
  'active'
FROM "users"
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;--> statement-breakpoint

UPDATE "teams"
SET "workspace_id" = (
  SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1
)
WHERE "workspace_id" IS NULL;--> statement-breakpoint

WITH "event_type_targets" AS (
  SELECT
    "event_type"."id",
    "event_type"."slug",
    COALESCE(
      (SELECT "workspace_id" FROM "teams" WHERE "teams"."id" = "event_type"."team_id"),
      (
        SELECT "workspace_id"
        FROM "workspace_members"
        WHERE "workspace_members"."user_id" = "event_type"."owner_user_id"
        ORDER BY "created_at", "workspace_id"
        LIMIT 1
      ),
      (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
    ) AS "target_workspace_id"
  FROM "event_types" AS "event_type"
),
"ranked_event_types" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "target_workspace_id", "slug"
      ORDER BY "id"
    ) AS "slug_rank"
  FROM "event_type_targets"
)
UPDATE "event_types"
SET "slug" = left("event_types"."slug", 68) || '-' ||
  left(replace("event_types"."id"::text, '-', ''), 8)
FROM "ranked_event_types"
WHERE "event_types"."id" = "ranked_event_types"."id"
  AND "ranked_event_types"."slug_rank" > 1;--> statement-breakpoint

UPDATE "event_types" AS "event_type"
SET "workspace_id" = COALESCE(
  (SELECT "workspace_id" FROM "teams" WHERE "teams"."id" = "event_type"."team_id"),
  (
    SELECT "workspace_id"
    FROM "workspace_members"
    WHERE "workspace_members"."user_id" = "event_type"."owner_user_id"
    ORDER BY "created_at", "workspace_id"
    LIMIT 1
  ),
  (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
)
WHERE "workspace_id" IS NULL;--> statement-breakpoint

UPDATE "bookings" AS "booking"
SET "workspace_id" = (
  SELECT "workspace_id"
  FROM "event_types"
  WHERE "event_types"."id" = "booking"."event_type_id"
)
WHERE "workspace_id" IS NULL;--> statement-breakpoint

UPDATE "routing_forms" AS "form"
SET "workspace_id" = COALESCE(
  (SELECT "workspace_id" FROM "teams" WHERE "teams"."id" = "form"."team_id"),
  (
    SELECT "workspace_id"
    FROM "workspace_members"
    WHERE "workspace_members"."user_id" = "form"."owner_user_id"
    ORDER BY "created_at", "workspace_id"
    LIMIT 1
  ),
  (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
)
WHERE "workspace_id" IS NULL;--> statement-breakpoint

UPDATE "webhooks" AS "webhook"
SET "workspace_id" = COALESCE(
  (SELECT "workspace_id" FROM "teams" WHERE "teams"."id" = "webhook"."team_id"),
  (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
)
WHERE "workspace_id" IS NULL;

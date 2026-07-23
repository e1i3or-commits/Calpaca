CREATE OR REPLACE FUNCTION "infer_event_type_workspace"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workspace_id" IS NULL THEN
    NEW."workspace_id" := COALESCE(
      (SELECT "workspace_id" FROM "teams" WHERE "id" = NEW."team_id"),
      (
        SELECT "workspace_id"
        FROM "workspace_members"
        WHERE "user_id" = NEW."owner_user_id" AND "status" = 'active'
        ORDER BY "created_at", "workspace_id"
        LIMIT 1
      ),
      (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "event_types_infer_workspace"
BEFORE INSERT ON "event_types"
FOR EACH ROW EXECUTE FUNCTION "infer_event_type_workspace"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "infer_booking_workspace"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workspace_id" IS NULL THEN
    NEW."workspace_id" := (
      SELECT "workspace_id" FROM "event_types" WHERE "id" = NEW."event_type_id"
    );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "bookings_infer_workspace"
BEFORE INSERT ON "bookings"
FOR EACH ROW EXECUTE FUNCTION "infer_booking_workspace"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "infer_routing_form_workspace"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workspace_id" IS NULL THEN
    NEW."workspace_id" := COALESCE(
      (SELECT "workspace_id" FROM "teams" WHERE "id" = NEW."team_id"),
      (
        SELECT "workspace_id"
        FROM "workspace_members"
        WHERE "user_id" = NEW."owner_user_id" AND "status" = 'active'
        ORDER BY "created_at", "workspace_id"
        LIMIT 1
      ),
      (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "routing_forms_infer_workspace"
BEFORE INSERT ON "routing_forms"
FOR EACH ROW EXECUTE FUNCTION "infer_routing_form_workspace"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "infer_webhook_workspace"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workspace_id" IS NULL THEN
    NEW."workspace_id" := COALESCE(
      (SELECT "workspace_id" FROM "teams" WHERE "id" = NEW."team_id"),
      (SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "webhooks_infer_workspace"
BEFORE INSERT ON "webhooks"
FOR EACH ROW EXECUTE FUNCTION "infer_webhook_workspace"();

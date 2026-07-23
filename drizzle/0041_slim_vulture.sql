CREATE TABLE "one_off_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"recipient_email" text,
	"slots" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_off_offers_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "one_off_offers" ADD CONSTRAINT "one_off_offers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_offers" ADD CONSTRAINT "one_off_offers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_offers" ADD CONSTRAINT "one_off_offers_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_offers" ADD CONSTRAINT "one_off_offers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_off_offer_workspace_idx" ON "one_off_offers" USING btree ("workspace_id","created_at");
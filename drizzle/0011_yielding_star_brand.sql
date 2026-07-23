CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_bucket_start_pk" PRIMARY KEY("key","bucket_start")
);

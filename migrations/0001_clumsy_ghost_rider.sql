CREATE TABLE "place_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer,
	"place_seed_raw_id" integer,
	"city_id" integer,
	"source_type" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_nubi_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"city_id" integer NOT NULL,
	"place_name" text NOT NULL,
	"source_rank" integer NOT NULL,
	"source_type" text NOT NULL,
	"nubi_reason" text NOT NULL,
	"evidence_url" text,
	"verified" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "place_nubi_reasons_place_id_unique" UNIQUE("place_id")
);
--> statement-breakpoint
CREATE TABLE "place_seed_raw" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer,
	"city_id" integer NOT NULL,
	"seed_category" text NOT NULL,
	"collection_phase" text,
	"rank" integer NOT NULL,
	"unified_id" text,
	"name_ko" text,
	"name_en" text NOT NULL,
	"google_search_note" text,
	"google_review_count_note" text,
	"google_image_count_note" text,
	"image_url" text,
	"source" text,
	"source_rank" integer,
	"source_type" text,
	"nubi_reason" text,
	"evidence_url" text,
	"evidence_verified" boolean DEFAULT false,
	"price_eur" real,
	"price_source" text,
	"price_fetched_at" timestamp,
	"google_place_id" text,
	"best_image_url" text,
	"celeb_mention" text,
	"naver_blog_count" integer,
	"vibe_keywords" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_bucket" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_phases" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_rank_fr" integer;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_rank_eu" integer;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_rank_basis" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_rank_note" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "mcp_rank_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "bts_rank" integer;--> statement-breakpoint
ALTER TABLE "data_sync_log" ADD COLUMN "entity_sub_type" text;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "user_birth_date" text;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "user_gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_paid" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_type" text DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "device_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_place_seed_raw_id_place_seed_raw_id_fk" FOREIGN KEY ("place_seed_raw_id") REFERENCES "public"."place_seed_raw"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_nubi_reasons" ADD CONSTRAINT "place_nubi_reasons_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_nubi_reasons" ADD CONSTRAINT "place_nubi_reasons_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_seed_raw" ADD CONSTRAINT "place_seed_raw_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_seed_raw" ADD CONSTRAINT "place_seed_raw_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;
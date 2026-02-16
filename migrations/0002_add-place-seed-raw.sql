-- MCP 1·2단계 통합 로우데이터 저장
CREATE TABLE IF NOT EXISTS "place_seed_raw" (
  "id" serial PRIMARY KEY NOT NULL,
  "city_id" integer NOT NULL REFERENCES "cities"("id") ON DELETE CASCADE,
  "seed_category" text NOT NULL,
  "rank" integer NOT NULL,
  "name_ko" text,
  "name_en" text NOT NULL,
  "google_search_note" text,
  "google_review_count_note" text,
  "google_image_count_note" text,
  "source" text,
  "source_rank" integer,
  "source_type" text,
  "nubi_reason" text,
  "evidence_url" text,
  "evidence_verified" boolean DEFAULT false,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_place_seed_raw_city_category"
  ON "place_seed_raw" ("city_id", "seed_category");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_place_seed_raw_city_category_rank"
  ON "place_seed_raw" ("city_id", "seed_category", "rank");

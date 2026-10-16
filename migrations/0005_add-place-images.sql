-- 이미지 통합 테이블 (인스타 우선)
-- instagram_photos, places.instagram_photo_urls, celebrity_place_evidence, places.photoUrls 통합
CREATE TABLE IF NOT EXISTS "place_images" (
  "id" serial PRIMARY KEY NOT NULL,
  "place_id" integer REFERENCES "places"("id") ON DELETE CASCADE,
  "place_seed_raw_id" integer REFERENCES "place_seed_raw"("id") ON DELETE CASCADE,
  "city_id" integer REFERENCES "cities"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "url" text NOT NULL,
  "sort_order" integer DEFAULT 1 NOT NULL,
  "fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "place_images_place_id_idx" ON "place_images" ("place_id");
CREATE INDEX IF NOT EXISTS "place_images_city_id_idx" ON "place_images" ("city_id");
CREATE INDEX IF NOT EXISTS "place_images_sort_order_idx" ON "place_images" ("sort_order");

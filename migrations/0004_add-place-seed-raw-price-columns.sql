-- MCP 3단계: place_seed_raw 가격 컬럼 추가
ALTER TABLE "place_seed_raw"
  ADD COLUMN IF NOT EXISTS "price_eur" real,
  ADD COLUMN IF NOT EXISTS "price_source" text,
  ADD COLUMN IF NOT EXISTS "price_fetched_at" timestamp;

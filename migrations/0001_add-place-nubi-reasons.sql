-- nubiReason 배치 수집 결과 (10곳/회 Gemini + 4단계 검증)
CREATE TABLE IF NOT EXISTS "place_nubi_reasons" (
  "id" serial PRIMARY KEY NOT NULL,
  "place_id" integer NOT NULL UNIQUE REFERENCES "places"("id") ON DELETE CASCADE,
  "city_id" integer NOT NULL REFERENCES "cities"("id") ON DELETE CASCADE,
  "place_name" text NOT NULL,
  "source_rank" integer NOT NULL,
  "source_type" text NOT NULL,
  "nubi_reason" text NOT NULL,
  "evidence_url" text,
  "verified" boolean DEFAULT false,
  "fetched_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

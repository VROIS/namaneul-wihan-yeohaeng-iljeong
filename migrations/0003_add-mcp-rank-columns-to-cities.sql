-- MCP 고정 순위(프랑스30/유럽30) 컬럼 추가
ALTER TABLE "cities"
  ADD COLUMN IF NOT EXISTS "mcp_bucket" text,
  ADD COLUMN IF NOT EXISTS "mcp_rank_fr" integer,
  ADD COLUMN IF NOT EXISTS "mcp_rank_eu" integer,
  ADD COLUMN IF NOT EXISTS "mcp_rank_basis" text,
  ADD COLUMN IF NOT EXISTS "mcp_rank_note" text,
  ADD COLUMN IF NOT EXISTS "mcp_rank_updated_at" timestamp;

-- 범위 제약: 순위는 1~30만 허용 (중복 실행 안전)
DO $$
BEGIN
  ALTER TABLE "cities"
    ADD CONSTRAINT "chk_cities_mcp_rank_fr_range"
    CHECK ("mcp_rank_fr" IS NULL OR ("mcp_rank_fr" BETWEEN 1 AND 30));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "cities"
    ADD CONSTRAINT "chk_cities_mcp_rank_eu_range"
    CHECK ("mcp_rank_eu" IS NULL OR ("mcp_rank_eu" BETWEEN 1 AND 30));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 중복 방지: 순위값은 phase별 유일해야 함
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cities_mcp_rank_fr"
  ON "cities" ("mcp_rank_fr")
  WHERE "mcp_rank_fr" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cities_mcp_rank_eu"
  ON "cities" ("mcp_rank_eu")
  WHERE "mcp_rank_eu" IS NOT NULL;

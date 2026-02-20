-- BTS 2026: cities.bts_rank (1~34, MCP Stage1 검색 대상)
ALTER TABLE "cities"
  ADD COLUMN IF NOT EXISTS "bts_rank" integer;

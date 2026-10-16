-- BTS 2026 MCP: cities.mcp_phases, place_seed_raw.collection_phase, place_seed_raw.image_url
ALTER TABLE "cities"
  ADD COLUMN IF NOT EXISTS "mcp_phases" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "place_seed_raw"
  ADD COLUMN IF NOT EXISTS "collection_phase" text,
  ADD COLUMN IF NOT EXISTS "image_url" text;

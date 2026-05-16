import pg from 'pg';
import fs from 'fs';

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE
      name_en IS NOT NULL
      AND name_ko IS NOT NULL
      AND name_local IS NOT NULL
      AND address IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND google_place_id IS NOT NULL
      AND (image_url IS NOT NULL OR (photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0))
      AND summary_ko IS NOT NULL
      AND editorial_summary IS NOT NULL
      AND price_eur IS NOT NULL
      AND google_review_count IS NOT NULL
      AND google_maps_uri IS NOT NULL
    )::int AS complete_13,
    COUNT(*) FILTER (WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store') AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))) AND NOT ('archived-2026-05' = ANY(COALESCE(phase_tags, ARRAY[]::text[]))))::int AS active_total
  FROM place_seed_raw;
`);
console.table(r.rows);

const r2 = await c.query(`
  SELECT seed_category,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE
      name_en IS NOT NULL
      AND name_ko IS NOT NULL
      AND name_local IS NOT NULL
      AND address IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND google_place_id IS NOT NULL
      AND (image_url IS NOT NULL OR (photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0))
      AND summary_ko IS NOT NULL
      AND editorial_summary IS NOT NULL
      AND price_eur IS NOT NULL
      AND google_review_count IS NOT NULL
      AND google_maps_uri IS NOT NULL
    )::int AS complete_13
  FROM place_seed_raw
  GROUP BY seed_category
  ORDER BY total DESC;
`);
console.table(r2.rows);

await c.end();

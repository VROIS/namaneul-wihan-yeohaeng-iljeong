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
const c = new pg.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('═════════ merge 후 상태 ═════════');
const r = await c.query(`
  SELECT
    (SELECT COUNT(*)::int FROM place_seed_raw) AS total,
    (SELECT COUNT(*)::int FROM place_seed_raw WHERE 'archived-merge-2026-05-15' = ANY(COALESCE(phase_tags, '{}'))) AS archived,
    (SELECT COUNT(*)::int FROM place_seed_raw
      WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
        AND NOT ('archived-merge-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
        AND NOT ('archived-merge-2026-05-15' = ANY(COALESCE(phase_tags, '{}')))
        AND NOT ('archived-bad-name-2026-05-14' = ANY(COALESCE(phase_tags, '{}')))
        AND NOT ('archived-2026-05' = ANY(COALESCE(phase_tags, '{}')))
    ) AS active_now
`);
console.table(r.rows);

console.log('\n═════════ 13 SSOT 채움률 (= 활성 행) ═════════');
const r2 = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)::int AS name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL)::int AS name_ko,
    COUNT(*) FILTER (WHERE name_local IS NOT NULL)::int AS name_local,
    COUNT(*) FILTER (WHERE address IS NOT NULL)::int AS address,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS pid,
    COUNT(*) FILTER (WHERE image_url IS NOT NULL OR (photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0))::int AS image,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL)::int AS editorial,
    COUNT(*) FILTER (WHERE price_eur IS NOT NULL)::int AS price_eur,
    COUNT(*) FILTER (WHERE google_review_count IS NOT NULL)::int AS rc,
    COUNT(*) FILTER (WHERE google_maps_uri IS NOT NULL)::int AS gmaps_uri,
    COUNT(*) FILTER (WHERE opening_hours IS NOT NULL)::int AS opening
  FROM place_seed_raw
  WHERE NOT ('archived-merge-2026-05-15' = ANY(COALESCE(phase_tags, '{}')))
`);
console.table(r2.rows);

console.log('\n═════════ 잔존 중복 쌍 = 활성 행 안 ═════════');
const r3 = await c.query(`
  WITH n AS (
    SELECT id, city_id, google_place_id, google_maps_uri, latitude, longitude,
      LOWER(TRIM(regexp_replace(regexp_replace(COALESCE(address, ''), '[.,;:!?''"()\\[\\]{}]', ' ', 'g'), '\\s+', ' ', 'g'))) AS na,
      LOWER(TRIM(name_en)) AS n_en, LOWER(TRIM(name_local)) AS n_local, LOWER(TRIM(name_ko)) AS n_ko
    FROM place_seed_raw
    WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
      AND NOT ('archived-merge-2026-05-15' = ANY(COALESCE(phase_tags, '{}')))
  )
  SELECT COUNT(*)::int AS remaining
  FROM n a JOIN n b ON b.city_id = a.city_id AND b.id < a.id
  WHERE (a.google_place_id IS NOT NULL AND b.google_place_id IS NOT NULL AND a.google_place_id = b.google_place_id)
     OR (LENGTH(a.na) >= 20 AND LENGTH(b.na) >= 20 AND a.na = b.na)
     OR (a.google_maps_uri IS NOT NULL AND b.google_maps_uri IS NOT NULL AND a.google_maps_uri = b.google_maps_uri)
     OR (a.latitude IS NOT NULL AND b.latitude IS NOT NULL AND abs(a.latitude - b.latitude) < 0.0001 AND abs(a.longitude - b.longitude) < 0.0001)
     OR ((a.n_en IS NOT NULL AND b.n_en IS NOT NULL AND a.n_en = b.n_en)
      OR (a.n_en IS NOT NULL AND b.n_local IS NOT NULL AND a.n_en = b.n_local)
      OR (a.n_en IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_en = b.n_ko)
      OR (a.n_local IS NOT NULL AND b.n_en IS NOT NULL AND a.n_local = b.n_en)
      OR (a.n_local IS NOT NULL AND b.n_local IS NOT NULL AND a.n_local = b.n_local)
      OR (a.n_local IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_local = b.n_ko)
      OR (a.n_ko IS NOT NULL AND b.n_en IS NOT NULL AND a.n_ko = b.n_en)
      OR (a.n_ko IS NOT NULL AND b.n_local IS NOT NULL AND a.n_ko = b.n_local)
      OR (a.n_ko IS NOT NULL AND b.n_ko IS NOT NULL AND a.n_ko = b.n_ko))
`);
console.table(r3.rows);

await c.end();

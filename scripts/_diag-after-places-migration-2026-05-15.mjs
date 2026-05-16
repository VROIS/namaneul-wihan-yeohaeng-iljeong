// 1 회용 = places → place_seed_raw 마이그 후 검증
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

console.log('═════════ 1. place_seed_raw 행 수 변화 ═════════');
const r1 = await c.query(`
  SELECT
    (SELECT COUNT(*)::int FROM place_seed_raw) AS total_now,
    (SELECT COUNT(*)::int FROM places) AS places_count,
    (SELECT COUNT(*)::int FROM _places_to_seedraw_mapping) AS mapped
`);
console.table(r1.rows);
console.log(`이전 = 11,005 → 신규 INSERT 615 → 예상 11,620 / 실제 ${r1.rows[0].total_now}`);

console.log('\n═════════ 2. 13 SSOT 요소 채움률 변화 ═════════');
const r2 = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)::int AS name_en,
    COUNT(*) FILTER (WHERE name_ko IS NOT NULL)::int AS name_ko,
    COUNT(*) FILTER (WHERE name_local IS NOT NULL)::int AS name_local,
    COUNT(*) FILTER (WHERE address IS NOT NULL)::int AS address,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL)::int AS coords,
    COUNT(*) FILTER (WHERE google_place_id IS NOT NULL)::int AS pid,
    COUNT(*) FILTER (WHERE image_url IS NOT NULL OR (photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0))::int AS image_or_photos,
    COUNT(*) FILTER (WHERE summary_ko IS NOT NULL)::int AS summary_ko,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL)::int AS editorial_summary,
    COUNT(*) FILTER (WHERE price_eur IS NOT NULL)::int AS price_eur,
    COUNT(*) FILTER (WHERE google_review_count IS NOT NULL)::int AS google_review_count,
    COUNT(*) FILTER (WHERE google_maps_uri IS NOT NULL)::int AS google_maps_uri,
    COUNT(*) FILTER (WHERE opening_hours IS NOT NULL)::int AS opening_hours
  FROM place_seed_raw;
`);
console.table(r2.rows);

console.log('\n═════════ 3. 매핑 테이블 action 분포 ═════════');
const r3 = await c.query(`
  SELECT action, COUNT(*)::int AS count
  FROM _places_to_seedraw_mapping
  GROUP BY action
  ORDER BY count DESC;
`);
console.table(r3.rows);

console.log('\n═════════ 4. 신규 INSERT 615 행 = collection_phase 검증 ═════════');
const r4 = await c.query(`
  SELECT collection_phase, COUNT(*)::int AS count
  FROM place_seed_raw
  WHERE collection_phase = 'places-migration-2026-05-15'
  GROUP BY collection_phase;
`);
console.table(r4.rows);

console.log('\n═════════ 5. 보조 테이블 = 매핑 가능 행 수 확인 (= 다음 단계 입력) ═════════');
const r5 = await c.query(`
  SELECT
    (SELECT COUNT(*)::int FROM place_images WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS images_mappable,
    (SELECT COUNT(*)::int FROM place_prices WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS prices_mappable,
    (SELECT COUNT(*)::int FROM gemini_web_search_cache WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS gemini_mappable,
    (SELECT COUNT(*)::int FROM tripadvisor_data WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS tripadvisor_mappable,
    (SELECT COUNT(*)::int FROM naver_blog_posts WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS naver_mappable,
    (SELECT COUNT(*)::int FROM place_data_sources WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS data_sources_mappable,
    (SELECT COUNT(*)::int FROM place_nubi_reasons WHERE place_id IN (SELECT places_id FROM _places_to_seedraw_mapping)) AS nubi_mappable;
`);
console.table(r5.rows);

await c.end();
console.log('\n═════════ 완료. SELECT only. ═════════');

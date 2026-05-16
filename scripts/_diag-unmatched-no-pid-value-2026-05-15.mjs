// 1 회용 = 미매칭 630 places 중 PID 없는 197 행의 가치 분석
// 사용자 명시 2026-05-15: 신규는 pid 기준으로 생성 = 미보유 197 행 처리 결정 필요

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

const MATCHED_CTE = `
  WITH matched AS (
    SELECT DISTINCT p.id AS places_id
    FROM places p
    WHERE
      (p.google_place_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id))
      OR (p.address IS NOT NULL AND length(trim(p.address)) > 20
        AND EXISTS (SELECT 1 FROM place_seed_raw s
          WHERE s.address IS NOT NULL
            AND lower(trim(regexp_replace(s.address, '[\\s,]+', ' ', 'g'))) =
                lower(trim(regexp_replace(p.address, '[\\s,]+', ' ', 'g')))))
      OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND EXISTS (SELECT 1 FROM place_seed_raw s
          WHERE s.city_id = p.city_id
            AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
            AND abs(s.latitude - p.latitude) < 0.0001
            AND abs(s.longitude - p.longitude) < 0.0001))
      OR (p.name IS NOT NULL
        AND EXISTS (SELECT 1 FROM place_seed_raw s
          WHERE s.city_id = p.city_id
            AND lower(trim(s.name_en)) = lower(trim(p.name))))
  ),
  unmatched_no_pid AS (
    SELECT p.* FROM places p
    WHERE p.id NOT IN (SELECT places_id FROM matched)
      AND p.google_place_id IS NULL
  )
`;

console.log('═════════ 1. 미매칭 + PID 없는 197 행 = 가치 분석 ═════════');
const r1 = await c.query(`
  ${MATCHED_CTE}
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE name IS NOT NULL AND name <> '')::int AS with_name,
    COUNT(*) FILTER (WHERE address IS NOT NULL)::int AS with_address,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL)::int AS with_coords,
    COUNT(*) FILTER (WHERE photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0)::int AS with_photos,
    COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL)::int AS with_editorial,
    COUNT(*) FILTER (WHERE display_name_ko IS NOT NULL)::int AS with_name_ko,
    COUNT(*) FILTER (WHERE buzz_score IS NOT NULL)::int AS with_buzz_score,
    COUNT(*) FILTER (WHERE google_maps_uri IS NOT NULL)::int AS with_google_maps_uri
  FROM unmatched_no_pid;
`);
console.table(r1.rows);

console.log('\n═════════ 2. 미매칭 + PID 없는 행 = 도시별 분포 (상위 10) ═════════');
const r2 = await c.query(`
  ${MATCHED_CTE}
  SELECT
    p.city_id,
    (SELECT name_en FROM cities WHERE id = p.city_id) AS city,
    COUNT(*)::int AS count
  FROM unmatched_no_pid p
  GROUP BY p.city_id
  ORDER BY count DESC
  LIMIT 10;
`);
console.table(r2.rows);

console.log('\n═════════ 3. 미매칭 + PID 없는 행 = 보조 테이블 행 보유 ═════════');
const r3 = await c.query(`
  ${MATCHED_CTE}
  SELECT
    (SELECT COUNT(*)::int FROM place_images WHERE place_id IN (SELECT id FROM unmatched_no_pid)) AS images,
    (SELECT COUNT(*)::int FROM place_prices WHERE place_id IN (SELECT id FROM unmatched_no_pid)) AS prices,
    (SELECT COUNT(*)::int FROM gemini_web_search_cache WHERE place_id IN (SELECT id FROM unmatched_no_pid)) AS gemini,
    (SELECT COUNT(*)::int FROM tripadvisor_data WHERE place_id IN (SELECT id FROM unmatched_no_pid)) AS tripadvisor,
    (SELECT COUNT(*)::int FROM naver_blog_posts WHERE place_id IN (SELECT id FROM unmatched_no_pid)) AS naver;
`);
console.table(r3.rows);

console.log('\n═════════ 4. 미매칭 + PID 없는 = 샘플 5 행 ═════════');
const r4 = await c.query(`
  ${MATCHED_CTE}
  SELECT id, city_id, name, address, latitude, longitude, type
  FROM unmatched_no_pid
  LIMIT 5;
`);
console.table(r4.rows);

await c.end();
console.log('\n═════════ 완료. SELECT only. ═════════');

// 1 회용 = 4 단계 매칭으로 = 보조 테이블 10 개의 로 데이터 = 몇 행을 place_seed_raw 로 가져올 수 있는지 시뮬
// 사용자 명시 2026-05-15: places.id 외래키로 연결된 10 개 보조 테이블 = €860 가치 (= TS Enterprise PID)
// = 4 단계 매칭 (PID/주소/좌표/이름) 으로 places.id → place_seed_raw.id 재연결 = 보조 데이터 가져오기

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

console.log('═══════════════════════════════════════════════════════════');
console.log('4 단계 매칭으로 재연결 가능한 로 데이터 행 수 시뮬');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 1. places.id → place_seed_raw.id 매핑 임시 뷰 ━━━━━━
// 4 단계 매칭: PID → 풀주소 → 좌표 10m → 이름
console.log('▶ 1. 매핑 가능 places.id 행 수 (= 4 단계 매칭):');
const m1 = await c.query(`
  WITH matched AS (
    SELECT DISTINCT p.id AS places_id
    FROM places p
    WHERE
      -- 0순위 PID
      (p.google_place_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM place_seed_raw s WHERE s.google_place_id = p.google_place_id))
      OR
      -- 1순위 풀 주소
      (p.address IS NOT NULL AND length(trim(p.address)) > 20
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s
          WHERE s.address IS NOT NULL
            AND lower(trim(regexp_replace(s.address, '[\\s,]+', ' ', 'g'))) =
                lower(trim(regexp_replace(p.address, '[\\s,]+', ' ', 'g')))
        ))
      OR
      -- 2순위 좌표 10m
      (p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s
          WHERE s.city_id = p.city_id
            AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
            AND abs(s.latitude - p.latitude) < 0.0001
            AND abs(s.longitude - p.longitude) < 0.0001
        ))
      OR
      -- 3순위 이름
      (p.name IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM place_seed_raw s
          WHERE s.city_id = p.city_id
            AND lower(trim(s.name_en)) = lower(trim(p.name))
        ))
  )
  SELECT
    (SELECT COUNT(*)::int FROM places) AS total_places,
    (SELECT COUNT(*)::int FROM matched) AS matched_places_id,
    (SELECT COUNT(*)::int FROM places) - (SELECT COUNT(*)::int FROM matched) AS unmatched_places_id;
`);
console.table(m1.rows);

// ━━━━━━ 2. 보조 테이블 10 개에서 = 매칭된 places.id 와 연결된 행 수 ━━━━━━
console.log('\n▶ 2. 보조 테이블별 = 4 단계 매칭으로 재연결 가능한 행 수:');

const SUB_TABLES = [
  { name: 'place_images', col: 'place_id' },
  { name: 'place_prices', col: 'place_id' },
  { name: 'gemini_web_search_cache', col: 'place_id' },
  { name: 'naver_blog_posts', col: 'place_id' },
  { name: 'tripadvisor_data', col: 'place_id' },
  { name: 'place_data_sources', col: 'place_id' },
  { name: 'place_nubi_reasons', col: 'place_id' },
  { name: 'youtube_place_mentions', col: 'place_id' },
  { name: 'celebrity_place_evidence', col: 'place_id' },
  { name: 'reviews', col: 'place_id' },
];

const subResults = [];
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
  )
`;

for (const { name, col } of SUB_TABLES) {
  try {
    const r = await c.query(`
      ${MATCHED_CTE}
      SELECT
        (SELECT COUNT(*)::int FROM "${name}") AS total_rows,
        (SELECT COUNT(*)::int FROM "${name}" t WHERE t."${col}" IN (SELECT places_id FROM matched)) AS recoverable_rows,
        (SELECT COUNT(*)::int FROM "${name}" t WHERE t."${col}" NOT IN (SELECT places_id FROM matched)) AS orphan_rows,
        (SELECT COUNT(*)::int FROM "${name}" t WHERE t."${col}" IS NULL) AS null_pid_rows;
    `);
    subResults.push({
      table: name,
      total: r.rows[0].total_rows,
      recoverable: r.rows[0].recoverable_rows,
      orphan: r.rows[0].orphan_rows,
      null_pid: r.rows[0].null_pid_rows,
    });
  } catch (e) {
    subResults.push({ table: name, error: e.message.slice(0, 60) });
  }
}
console.table(subResults);

// ━━━━━━ 3. 합계 ━━━━━━
const totalRecoverable = subResults.reduce((s, r) => s + (r.recoverable || 0), 0);
const totalAll = subResults.reduce((s, r) => s + (r.total || 0), 0);
console.log(`\n▶ 합계:`);
console.log(`  보조 테이블 10 개 전체 행: ${totalAll.toLocaleString()}`);
console.log(`  4 단계 매칭으로 재연결 가능 행: ${totalRecoverable.toLocaleString()}`);
console.log(`  재연결 비율: ${totalAll > 0 ? ((totalRecoverable / totalAll) * 100).toFixed(1) : 0}%`);

// ━━━━━━ 4. 매칭 안 된 630 places.id 도 = 보조 테이블 행 보유 여부 ━━━━━━
console.log('\n▶ 4. 매칭 안 된 630 places.id 의 보조 테이블 행 보유 (= 신규 INSERT 시 함께 가져갈 데이터):');
const m4 = await c.query(`
  ${MATCHED_CTE},
  unmatched AS (
    SELECT id FROM places WHERE id NOT IN (SELECT places_id FROM matched)
  )
  SELECT
    (SELECT COUNT(*)::int FROM place_images WHERE place_id IN (SELECT id FROM unmatched)) AS unmatched_images,
    (SELECT COUNT(*)::int FROM place_prices WHERE place_id IN (SELECT id FROM unmatched)) AS unmatched_prices,
    (SELECT COUNT(*)::int FROM gemini_web_search_cache WHERE place_id IN (SELECT id FROM unmatched)) AS unmatched_gemini,
    (SELECT COUNT(*)::int FROM naver_blog_posts WHERE place_id IN (SELECT id FROM unmatched)) AS unmatched_naver,
    (SELECT COUNT(*)::int FROM tripadvisor_data WHERE place_id IN (SELECT id FROM unmatched)) AS unmatched_tripadvisor;
`);
console.table(m4.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('시뮬 완료. SELECT only. DB 변경 0.');
console.log('═══════════════════════════════════════════════════════════');

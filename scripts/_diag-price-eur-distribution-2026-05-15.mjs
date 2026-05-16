// 1 회용 = place_seed_raw.price_eur 의 분포 진단 (= 사용자 SSOT 검증)
// 사용자 명시 2026-05-15: price_eur = 1인당 입장료 + 1인당 평균 식대 통합 컬럼
//
// 검증 항목:
//   1) seed_category 별 분포 (= 명소 vs 식당)
//   2) €500 초과 오염 행 식별
//   3) NULL 비율
//   4) tier 별 식당 가격 분포 확인 (= low/mid/high)

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
console.log('place_seed_raw.price_eur 분포 진단 (= 사용자 SSOT 검증)');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 1. seed_category 별 분포 ━━━━━━
console.log('▶ 1. seed_category 별 price_eur 분포 (= 1인당 EUR):');
const q1 = await c.query(`
  SELECT
    seed_category,
    COUNT(*) AS total,
    COUNT(price_eur) AS with_price,
    COUNT(*) - COUNT(price_eur) AS null_price,
    MIN(price_eur) AS min_eur,
    ROUND(AVG(price_eur)::numeric, 2) AS avg_eur,
    MAX(price_eur) AS max_eur,
    COUNT(*) FILTER (WHERE price_eur = 0) AS free_count,
    COUNT(*) FILTER (WHERE price_eur > 500) AS overflow_count
  FROM place_seed_raw
  WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  GROUP BY seed_category
  ORDER BY seed_category;
`);
console.table(q1.rows);

// ━━━━━━ 2. €500 초과 오염 행 식별 ━━━━━━
console.log('\n▶ 2. €500 초과 오염 행 (= 클라이언트 가드 차단 대상):');
const q2 = await c.query(`
  SELECT id, city_id, seed_category, name_en, name_ko, price_eur
  FROM place_seed_raw
  WHERE price_eur > 500
  ORDER BY price_eur DESC
  LIMIT 30;
`);
if (q2.rows.length === 0) {
  console.log('  → 오염 행 없음 = 깨끗');
} else {
  console.table(q2.rows);
}

// ━━━━━━ 3. 식당 tier 별 가격 분포 ━━━━━━
console.log('\n▶ 3. 식당 tier 별 price_eur 분포 (= category_tags 안의 low/mid/high):');
const q3 = await c.query(`
  SELECT
    CASE
      WHEN 'low' = ANY(category_tags) THEN 'low'
      WHEN 'mid' = ANY(category_tags) THEN 'mid'
      WHEN 'high' = ANY(category_tags) THEN 'high'
      ELSE 'none'
    END AS price_tier,
    COUNT(*) AS total,
    COUNT(price_eur) AS with_price,
    ROUND(AVG(price_eur)::numeric, 2) AS avg_eur,
    MIN(price_eur) AS min_eur,
    MAX(price_eur) AS max_eur
  FROM place_seed_raw
  WHERE seed_category = 'restaurant'
  GROUP BY 1
  ORDER BY 1;
`);
console.table(q3.rows);

// ━━━━━━ 4. 정상 범위 (= 0~500) 분포 히스토그램 ━━━━━━
console.log('\n▶ 4. 정상 범위 (= 0~500) price_eur 분포 히스토그램:');
const q4 = await c.query(`
  SELECT
    CASE
      WHEN price_eur = 0 THEN '0 (무료)'
      WHEN price_eur > 0 AND price_eur <= 10 THEN '1-10'
      WHEN price_eur > 10 AND price_eur <= 30 THEN '11-30'
      WHEN price_eur > 30 AND price_eur <= 70 THEN '31-70'
      WHEN price_eur > 70 AND price_eur <= 150 THEN '71-150'
      WHEN price_eur > 150 AND price_eur <= 500 THEN '151-500'
      WHEN price_eur > 500 THEN '500+ (오염)'
      ELSE 'NULL'
    END AS bucket,
    COUNT(*) AS count
  FROM place_seed_raw
  WHERE seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  GROUP BY 1
  ORDER BY MIN(COALESCE(price_eur, 0));
`);
console.table(q4.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('진단 완료. SELECT only. DB 변경 0.');
console.log('═══════════════════════════════════════════════════════════');

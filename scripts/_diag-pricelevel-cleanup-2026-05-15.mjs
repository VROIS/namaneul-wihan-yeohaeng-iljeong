// 1 회용 = priceLevel / priceSource 잔존 코드 제거 전 DB 사전 진단
// 사용자 명시 2026-05-15: AI 가 직접 pooler 접속하여 확인 후 결정
//
// 진단 항목:
//   1) place_seed_raw = 가격 컬럼 통합 확인 (price_eur 단일?)
//   2) places 테이블 = price_level 컬럼 살아있는지 + 실제 데이터 유무
//   3) place_data_sources 테이블 = price_level 컬럼 사용 여부
//   4) places 와 place_seed_raw 행 수 비교 (= 메인 테이블 식별)
//   5) places.price_level NOT NULL 행 수 (= 실제 사용 여부)

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
console.log('priceLevel / priceSource 잔존 진단 (= 2026-05-15)');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 1. place_seed_raw 가격 컬럼 ━━━━━━
console.log('▶ 1. place_seed_raw 가격 컬럼:');
const q1 = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'place_seed_raw' AND column_name LIKE 'price%'
  ORDER BY column_name;
`);
console.table(q1.rows);

// ━━━━━━ 2. places 테이블 가격 컬럼 ━━━━━━
console.log('\n▶ 2. places 테이블 가격 컬럼:');
const q2 = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'places' AND column_name LIKE 'price%'
  ORDER BY column_name;
`);
if (q2.rows.length === 0) {
  console.log('  → places 테이블 = 가격 컬럼 없음 (= 이미 제거됨 또는 테이블 없음)');
} else {
  console.table(q2.rows);
}

// ━━━━━━ 3. place_data_sources 테이블 가격 컬럼 ━━━━━━
console.log('\n▶ 3. place_data_sources 테이블 가격 컬럼:');
const q3 = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'place_data_sources' AND column_name LIKE 'price%'
  ORDER BY column_name;
`);
if (q3.rows.length === 0) {
  console.log('  → place_data_sources 테이블 = 가격 컬럼 없음 또는 테이블 없음');
} else {
  console.table(q3.rows);
}

// ━━━━━━ 4. 테이블 행 수 비교 ━━━━━━
console.log('\n▶ 4. 테이블 행 수 비교 (= 메인 SSOT 식별):');
const q4 = await c.query(`
  SELECT
    (SELECT COUNT(*) FROM place_seed_raw) AS seed_raw_count,
    (SELECT COUNT(*) FROM places) AS places_count
`);
console.table(q4.rows);

// ━━━━━━ 5. places.price_level 실제 데이터 ━━━━━━
console.log('\n▶ 5. places.price_level 실제 NOT NULL 행 수:');
try {
  const q5 = await c.query(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(price_level) AS rows_with_price_level,
      COUNT(*) - COUNT(price_level) AS rows_with_null
    FROM places;
  `);
  console.table(q5.rows);
} catch (e) {
  console.log(`  → 쿼리 실패: ${e.message}`);
}

// ━━━━━━ 6. place_data_sources.price_level 사용 여부 ━━━━━━
console.log('\n▶ 6. place_data_sources.price_level 사용 여부:');
try {
  const q6 = await c.query(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(price_level) AS rows_with_price_level,
      MAX(fetched_at) AS last_fetched
    FROM place_data_sources;
  `);
  console.table(q6.rows);
} catch (e) {
  console.log(`  → 쿼리 실패 (= 테이블 없음 가능): ${e.message}`);
}

// ━━━━━━ 7. place_seed_raw.price_eur 분포 ━━━━━━
console.log('\n▶ 7. place_seed_raw.price_eur 분포 (= SSOT 확인):');
const q7 = await c.query(`
  SELECT
    COUNT(*) AS total_rows,
    COUNT(price_eur) AS rows_with_price_eur,
    MIN(price_eur) AS min_price,
    MAX(price_eur) AS max_price,
    AVG(price_eur)::numeric(10,2) AS avg_price
  FROM place_seed_raw;
`);
console.table(q7.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('진단 완료. SELECT only. DB 변경 0.');
console.log('═══════════════════════════════════════════════════════════');

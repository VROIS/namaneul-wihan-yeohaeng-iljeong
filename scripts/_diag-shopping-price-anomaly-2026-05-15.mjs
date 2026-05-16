// 1 회용 = shopping 카테고리에 price_eur 가 들어가있는 이상 케이스 진단
// 사용자 명시 2026-05-15: 쇼핑 = 입장료 X + 식대 X = price_eur 자체 의미 없음

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
console.log('shopping 카테고리 price_eur 이상 케이스 진단');
console.log('═══════════════════════════════════════════════════════════\n');

// 1. shopping NOT NULL price_eur 전체 행 (= 21 행)
console.log('▶ 1. shopping seed_category = price_eur NOT NULL 행 전체:');
const q1 = await c.query(`
  SELECT id, city_id, name_en, name_ko, price_eur, summary_ko
  FROM place_seed_raw
  WHERE seed_category = 'shopping' AND price_eur IS NOT NULL
  ORDER BY price_eur DESC;
`);
console.table(q1.rows);

console.log(`\n  → 총 ${q1.rows.length} 행`);

// 2. 다른 카테고리 검증 = 모두 1인당 EUR 인지 확인 위해 = restaurant 정상 행 샘플
console.log('\n▶ 2. restaurant 정상 행 (= 0-150 EUR) 샘플 = 1인당 평균 식대 검증:');
const q2 = await c.query(`
  SELECT id, city_id, name_en, name_ko, price_eur
  FROM place_seed_raw
  WHERE seed_category = 'restaurant'
    AND price_eur IS NOT NULL
    AND price_eur > 0
    AND price_eur < 150
  ORDER BY price_eur ASC
  LIMIT 10;
`);
console.table(q2.rows);

console.log('\n▶ 3. attraction 정상 행 (= 0-150 EUR) 샘플 = 1인 입장료 검증:');
const q3 = await c.query(`
  SELECT id, city_id, name_en, name_ko, price_eur
  FROM place_seed_raw
  WHERE seed_category = 'attraction'
    AND price_eur IS NOT NULL
    AND price_eur > 0
    AND price_eur < 150
  ORDER BY price_eur ASC
  LIMIT 10;
`);
console.table(q3.rows);

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('진단 완료. SELECT only. DB 변경 0.');
console.log('═══════════════════════════════════════════════════════════');

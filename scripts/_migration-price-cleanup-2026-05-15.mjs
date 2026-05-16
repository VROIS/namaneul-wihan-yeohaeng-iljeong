// 1 회용 마이그레이션 = price_eur 단일 SSOT 강제 (2026-05-15 사용자 명시)
// = priceLevel / priceSource / priceFetchedAt 영구 폐기 + 오염 데이터 정제
//
// 작업:
//   P5-1) place_seed_raw.price_source / price_fetched_at = DROP COLUMN
//   P5-2) places.price_level = DROP COLUMN
//   P5-3) place_data_sources.price_level = DROP COLUMN
//   P6-1) shopping 카테고리 모든 price_eur = NULL (= 사용자 SSOT 부적합)
//   P6-2) price_eur > 500 = NULL (= 천 단위 오파싱 오염, 클라이언트 가드 이미 차단)
//   P6-3) price_eur > 0 AND price_eur < 1 = NULL (= 1/1000 오염, Interlaken 등)

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
console.log('price_eur 단일 SSOT 강제 마이그레이션 (2026-05-15)');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━ 사전 백업 카운트 ━━━━━━
const beforePlaceSeedRaw = (await c.query(`SELECT COUNT(*) FROM place_seed_raw`)).rows[0].count;
const beforePlaces = (await c.query(`SELECT COUNT(*) FROM places`)).rows[0].count;
const beforeShoppingPriced = (await c.query(`
  SELECT COUNT(*) FROM place_seed_raw
  WHERE seed_category = 'shopping' AND price_eur IS NOT NULL
`)).rows[0].count;
const beforeOverflow = (await c.query(`
  SELECT COUNT(*) FROM place_seed_raw WHERE price_eur > 500
`)).rows[0].count;
const beforeUnderflow = (await c.query(`
  SELECT COUNT(*) FROM place_seed_raw WHERE price_eur > 0 AND price_eur < 1
`)).rows[0].count;

console.log(`▶ 사전 카운트:`);
console.log(`  place_seed_raw: ${beforePlaceSeedRaw} 행`);
console.log(`  places: ${beforePlaces} 행`);
console.log(`  shopping NOT NULL price_eur: ${beforeShoppingPriced} 행 (= 정제 대상)`);
console.log(`  €500+ 오염: ${beforeOverflow} 행 (= 정제 대상)`);
console.log(`  1/1000 오염 (0~1): ${beforeUnderflow} 행 (= 정제 대상)\n`);

await c.query('BEGIN');
try {
  // ━━━━━━ P5-1: place_seed_raw.price_source / price_fetched_at DROP ━━━━━━
  console.log('▶ P5-1: place_seed_raw.price_source / price_fetched_at DROP COLUMN');
  await c.query(`ALTER TABLE place_seed_raw DROP COLUMN IF EXISTS price_source`);
  await c.query(`ALTER TABLE place_seed_raw DROP COLUMN IF EXISTS price_fetched_at`);
  console.log('  ✅ DROP 완료');

  // ━━━━━━ P5-2: places.price_level DROP ━━━━━━
  console.log('\n▶ P5-2: places.price_level DROP COLUMN');
  await c.query(`ALTER TABLE places DROP COLUMN IF EXISTS price_level`);
  console.log('  ✅ DROP 완료');

  // ━━━━━━ P5-3: place_data_sources.price_level DROP ━━━━━━
  console.log('\n▶ P5-3: place_data_sources.price_level DROP COLUMN');
  await c.query(`ALTER TABLE place_data_sources DROP COLUMN IF EXISTS price_level`);
  console.log('  ✅ DROP 완료');

  // ━━━━━━ P6-1: shopping 카테고리 price_eur = NULL ━━━━━━
  console.log('\n▶ P6-1: shopping 카테고리 price_eur = NULL');
  const r1 = await c.query(`
    UPDATE place_seed_raw
    SET price_eur = NULL
    WHERE seed_category = 'shopping' AND price_eur IS NOT NULL
  `);
  console.log(`  ✅ ${r1.rowCount} 행 NULL 처리`);

  // ━━━━━━ P6-2: €500+ 오염 NULL ━━━━━━
  console.log('\n▶ P6-2: price_eur > 500 = NULL (= 천 단위 오파싱)');
  const r2 = await c.query(`
    UPDATE place_seed_raw SET price_eur = NULL WHERE price_eur > 500
  `);
  console.log(`  ✅ ${r2.rowCount} 행 NULL 처리`);

  // ━━━━━━ P6-3: 1/1000 오염 NULL ━━━━━━
  console.log('\n▶ P6-3: price_eur > 0 AND price_eur < 1 = NULL (= 1/1000 오염)');
  const r3 = await c.query(`
    UPDATE place_seed_raw SET price_eur = NULL WHERE price_eur > 0 AND price_eur < 1
  `);
  console.log(`  ✅ ${r3.rowCount} 행 NULL 처리`);

  await c.query('COMMIT');
  console.log('\n✅ 트랜잭션 COMMIT 완료');

  // ━━━━━━ 사후 카운트 ━━━━━━
  const afterShoppingPriced = (await c.query(`
    SELECT COUNT(*) FROM place_seed_raw
    WHERE seed_category = 'shopping' AND price_eur IS NOT NULL
  `)).rows[0].count;
  const afterOverflow = (await c.query(`
    SELECT COUNT(*) FROM place_seed_raw WHERE price_eur > 500
  `)).rows[0].count;
  const afterUnderflow = (await c.query(`
    SELECT COUNT(*) FROM place_seed_raw WHERE price_eur > 0 AND price_eur < 1
  `)).rows[0].count;
  const afterValid = (await c.query(`
    SELECT COUNT(*) FROM place_seed_raw WHERE price_eur IS NOT NULL
  `)).rows[0].count;

  console.log('\n▶ 사후 카운트:');
  console.log(`  shopping NOT NULL: ${afterShoppingPriced} 행 (= 0 이어야 정상)`);
  console.log(`  €500+ 잔존: ${afterOverflow} 행 (= 0 이어야 정상)`);
  console.log(`  1/1000 잔존: ${afterUnderflow} 행 (= 0 이어야 정상)`);
  console.log(`  정상 price_eur 보유: ${afterValid} 행`);

  // 컬럼 DROP 검증
  console.log('\n▶ 컬럼 DROP 검증:');
  const cols1 = (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'place_seed_raw' AND column_name LIKE 'price%'
  `)).rows;
  console.log(`  place_seed_raw price 컬럼: ${JSON.stringify(cols1.map(r => r.column_name))} (= [price_eur] 만 이어야 정상)`);

  const cols2 = (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'places' AND column_name = 'price_level'
  `)).rows;
  console.log(`  places.price_level: ${cols2.length === 0 ? '✅ DROP 됨' : '🔴 잔존'}`);

  const cols3 = (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'place_data_sources' AND column_name = 'price_level'
  `)).rows;
  console.log(`  place_data_sources.price_level: ${cols3.length === 0 ? '✅ DROP 됨' : '🔴 잔존'}`);

} catch (e) {
  await c.query('ROLLBACK');
  console.error('\n❌ 트랜잭션 ROLLBACK:', e.message);
  process.exit(1);
}

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log('마이그레이션 완료. price_eur 단일 SSOT 확정.');
console.log('═══════════════════════════════════════════════════════════');

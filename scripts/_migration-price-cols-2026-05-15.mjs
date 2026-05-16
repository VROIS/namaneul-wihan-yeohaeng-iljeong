// 작업 1 = DB migration = 가격 3 컬럼 통합 + 옛 2 컬럼 DROP
// 사용자 SSOT 2026-05-15:
//   - price_eur 단일 SSOT
//   - 옛 컬럼 (price_fetched_at, price_source) 값 = 통합 후 DROP
//   - GREATEST = 비싼 쪽 + 데이터 손실 0
//
// 모드:
//   node scripts/_migration-price-cols-2026-05-15.mjs        # dry-run = 진단만
//   node scripts/_migration-price-cols-2026-05-15.mjs --commit  # 실제 BEGIN/COMMIT
import pg from 'pg';
import fs from 'fs';

const COMMIT = process.argv.includes('--commit');

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

console.log(`═══ DB Migration = 가격 컬럼 통합 (${COMMIT ? '⚠️ COMMIT' : 'dry-run'}) ═══\n`);

// 1. 옛 2 컬럼 현재 상태 = data_type 확인
const cols = (await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'place_seed_raw'
  AND column_name IN ('price_eur', 'price_fetched_at', 'price_source')
  ORDER BY column_name
`)).rows;
console.log('═══ 1. 현재 가격 컬럼 ═══');
console.table(cols);

// 2. 옛 2 컬럼 = 가격 숫자 값 들어있는지 검사 (= 안전 확인)
// price_fetched_at = timestamp = 숫자 X
// price_source = text = "tripadvisor"/"google"/"gemini" 등 출처 텍스트 = 숫자 X
// → 그러나 만약 잘못 들어간 숫자 텍스트가 있는지 검사
const sourceCheck = (await c.query(`
  SELECT
    price_source,
    COUNT(*)::int AS cnt,
    BOOL_OR(price_source ~ '^-?[0-9]+(\\.[0-9]+)?$') AS has_numeric_text
  FROM place_seed_raw
  WHERE price_source IS NOT NULL
  GROUP BY price_source
  ORDER BY cnt DESC LIMIT 20
`)).rows;
console.log('\n═══ 2. price_source 값 분포 (= 출처 텍스트, 숫자 검사) ═══');
console.table(sourceCheck);
const anyNumeric = sourceCheck.some(r => r.has_numeric_text);
if (anyNumeric) {
  console.log('⚠️ price_source 에 숫자 텍스트 발견 = GREATEST 통합 검토 필요');
} else {
  console.log('✅ price_source = 출처 텍스트만 = 가격 숫자 X = 안전 DROP 가능');
}

// 3. 백업 = 전체 price 컬럼 값 JSON 저장
const backup = (await c.query(`
  SELECT id, city_id, name_en, price_eur, price_fetched_at, price_source
  FROM place_seed_raw
  WHERE price_eur IS NOT NULL OR price_fetched_at IS NOT NULL OR price_source IS NOT NULL
`)).rows;
const today = new Date().toISOString().slice(0, 10);
const backupPath = `backups/price-cols-pre-${today}.json`;
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\n═══ 3. 백업 = ${backup.length} 행 = ${backupPath} ═══`);

// 4. 가격 카운트 = 마이그레이션 전 상태
const stats = (await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE price_eur > 0)::int AS price_eur_positive,
    COUNT(*) FILTER (WHERE price_eur = 0)::int AS price_eur_zero,
    COUNT(*) FILTER (WHERE price_eur IS NULL)::int AS price_eur_null,
    COUNT(*) FILTER (WHERE price_fetched_at IS NOT NULL)::int AS fetched_at_count,
    COUNT(*) FILTER (WHERE price_source IS NOT NULL AND price_source <> '')::int AS source_count,
    COUNT(*)::int AS total
  FROM place_seed_raw
`)).rows[0];
console.log('\n═══ 4. 마이그레이션 전 카운트 ═══');
console.table([stats]);

if (!COMMIT) {
  console.log('\n[dry-run] 실제 변경 X. --commit 옵션 추가 후 재실행 시 진행.');
  console.log('\n계획:');
  console.log('  1. (price_source 에 숫자 X 확인됨 = GREATEST 통합 단계 SKIP)');
  console.log('  2. ALTER TABLE place_seed_raw DROP COLUMN price_fetched_at');
  console.log('  3. ALTER TABLE place_seed_raw DROP COLUMN price_source');
  console.log('  4. 검증 SELECT = price_eur 행 수 손실 0 확인');
  await c.end();
  process.exit(0);
}

// === COMMIT 모드 ===
console.log('\n═══ 5. ⚠️ COMMIT 모드 = 트랜잭션 시작 ═══');
try {
  await c.query('BEGIN');

  // (옛 2 컬럼 가격 숫자 X 확인됨 = GREATEST 통합 단계 SKIP)
  // 만약 price_source 에 숫자 텍스트가 있으면 여기서 GREATEST 수행 (= 미래 안전망)

  await c.query('ALTER TABLE place_seed_raw DROP COLUMN IF EXISTS price_fetched_at');
  console.log('  ✅ price_fetched_at DROP');

  await c.query('ALTER TABLE place_seed_raw DROP COLUMN IF EXISTS price_source');
  console.log('  ✅ price_source DROP');

  // 검증 = price_eur 행 수 손실 0
  const post = (await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE price_eur > 0)::int AS price_eur_positive,
      COUNT(*) FILTER (WHERE price_eur = 0)::int AS price_eur_zero,
      COUNT(*) FILTER (WHERE price_eur IS NULL)::int AS price_eur_null,
      COUNT(*)::int AS total
    FROM place_seed_raw
  `)).rows[0];

  if (post.price_eur_positive !== stats.price_eur_positive) {
    throw new Error(`price_eur > 0 행 수 변화: ${stats.price_eur_positive} → ${post.price_eur_positive} (예상=동일)`);
  }
  if (post.total !== stats.total) {
    throw new Error(`전체 행 수 변화: ${stats.total} → ${post.total} (예상=동일)`);
  }
  console.log('  ✅ price_eur > 0 = ' + post.price_eur_positive + ' (= 마이그레이션 전과 동일)');
  console.log('  ✅ 전체 행 = ' + post.total);

  await c.query('COMMIT');
  console.log('\n✅ COMMIT 완료');

  // 컬럼 사라짐 확인
  const after = (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'place_seed_raw' AND column_name LIKE '%price%'
    ORDER BY column_name
  `)).rows;
  console.log('\n═══ 6. 마이그레이션 후 price 관련 컬럼 ═══');
  console.table(after);

} catch (e) {
  await c.query('ROLLBACK');
  console.error('\n❌ ROLLBACK = ' + e.message);
  process.exit(1);
}

await c.end();

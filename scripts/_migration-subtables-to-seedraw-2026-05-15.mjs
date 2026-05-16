// 1 회 마이그 = 보조 테이블 7 개 → place_seed_raw 컬럼 보강 (2026-05-15)
// 매핑 키 = _places_to_seedraw_mapping (= places.id ↔ place_seed_raw.id)
// 원칙 = COALESCE 옛 우선 / GREATEST 가격 / UNION tags
// = €860 금고 보존 (= 원본 보조 테이블 변경 0)
//
// 보조 테이블 작업:
//   1) place_images       → place_seed_raw.image_url (= NULL 채움 + 1순위 url)
//   2) place_prices       → place_seed_raw.price_eur (= GREATEST)
//   3) place_data_sources → place_seed_raw.google_rating + google_review_count (= COALESCE)
//   4) gemini_web_search_cache → place_seed_raw.category_tags 'hotspot' 추가
//   5) place_nubi_reasons → place_seed_raw.nubi_reason (= COALESCE 옛 우선)
//   6) naver_blog_posts COUNT → place_seed_raw.naver_blog_count
//
// 제외:
//   tripadvisor_data (= place_seed_raw 컬럼 없음 = §17)
//   youtube_place_mentions (= place_id 모두 NULL)
//   celebrity_place_evidence (= 1 행)
//   reviews (= 0 행)
//
// shopping 카테고리 = price_eur 강제 NULL (= seed-gemini.mjs 가드 일관)
// €500+ 오염 / 0~1 EUR 오염 = 제외

import pg from 'pg';
import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

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
console.log(`보조 테이블 7 개 → place_seed_raw 마이그 (${DRY_RUN ? 'DRY RUN' : 'REAL COMMIT'})`);
console.log('═══════════════════════════════════════════════════════════\n');

const startTime = Date.now();

await c.query('BEGIN');
const stats = {};

try {
  // ━━━━━━ 1. place_images → image_url ━━━━━━
  // place_images.place_seed_raw_id 가 이미 98.9% 연결됨 (= 메인앱 접근 가능)
  // 추가 = place_seed_raw.image_url 이 NULL 인 행 = place_images 의 sort_order 0 url 로 채움
  console.log('▶ 1. place_images → place_seed_raw.image_url (= NULL 채움):');
  const r1 = await c.query(`
    UPDATE place_seed_raw psr
    SET image_url = pi.url,
        image_updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (m.seed_raw_id)
        m.seed_raw_id, pi.url
      FROM _places_to_seedraw_mapping m
      JOIN place_images pi ON pi.place_id = m.places_id
      WHERE pi.url IS NOT NULL AND pi.url <> ''
      ORDER BY m.seed_raw_id, pi.sort_order ASC NULLS LAST, pi.id ASC
    ) pi
    WHERE psr.id = pi.seed_raw_id
      AND psr.image_url IS NULL
    RETURNING psr.id
  `);
  stats.image_url_filled = r1.rowCount;
  console.log(`  ✅ ${r1.rowCount} 행 image_url 보강`);

  // ━━━━━━ 2. place_prices → price_eur GREATEST ━━━━━━
  // = price_average / price_high / price_low 중 max 사용
  // = shopping 카테고리 제외 + €500+ 오염 제외 + 0~1 EUR 오염 제외
  console.log('\n▶ 2. place_prices → place_seed_raw.price_eur (= GREATEST):');
  const r2 = await c.query(`
    WITH max_prices AS (
      SELECT
        m.seed_raw_id,
        MAX(GREATEST(
          COALESCE(pp.price_average, 0),
          COALESCE(pp.price_high, 0),
          COALESCE(pp.price_low, 0)
        )) AS max_price
      FROM _places_to_seedraw_mapping m
      JOIN place_prices pp ON pp.place_id = m.places_id
      WHERE pp.currency = 'EUR'
      GROUP BY m.seed_raw_id
    )
    UPDATE place_seed_raw psr
    SET price_eur = GREATEST(COALESCE(psr.price_eur, 0)::real, mp.max_price::real)
    FROM max_prices mp
    WHERE psr.id = mp.seed_raw_id
      AND mp.max_price > 1                    -- 1/1000 오염 제외
      AND mp.max_price <= 500                  -- €500+ 오염 제외
      AND psr.seed_category <> 'shopping'      -- shopping 가드
    RETURNING psr.id
  `);
  stats.price_eur_updated = r2.rowCount;
  console.log(`  ✅ ${r2.rowCount} 행 price_eur GREATEST 적용`);

  // ━━━━━━ 3. place_data_sources google → google_rating + google_review_count ━━━━━━
  console.log('\n▶ 3. place_data_sources (google) → google_rating + google_review_count:');
  const r3 = await c.query(`
    UPDATE place_seed_raw psr
    SET
      google_rating = COALESCE(psr.google_rating, pds.rating::real),
      google_review_count = COALESCE(psr.google_review_count, pds.review_count)
    FROM _places_to_seedraw_mapping m
    JOIN place_data_sources pds ON pds.place_id = m.places_id AND pds.source = 'google'
    WHERE psr.id = m.seed_raw_id
      AND (psr.google_rating IS NULL OR psr.google_review_count IS NULL)
    RETURNING psr.id
  `);
  stats.rating_review_updated = r3.rowCount;
  console.log(`  ✅ ${r3.rowCount} 행 rating/review_count 보강`);

  // ━━━━━━ 4. gemini_web_search_cache (photospot+verified) → category_tags 'hotspot' UNION ━━━━━━
  console.log('\n▶ 4. gemini_web_search_cache (photospot+verified) → category_tags 추가:');
  const r4 = await c.query(`
    UPDATE place_seed_raw psr
    SET category_tags = (
      SELECT ARRAY(SELECT DISTINCT unnest(
        COALESCE(psr.category_tags, ARRAY[]::text[]) || ARRAY['hotspot']::text[]
      ))
    )
    FROM (
      SELECT DISTINCT m.seed_raw_id
      FROM _places_to_seedraw_mapping m
      JOIN gemini_web_search_cache g ON g.place_id = m.places_id
      WHERE g.search_type = 'photospot' AND g.is_verified = true
    ) v
    WHERE psr.id = v.seed_raw_id
      AND NOT ('hotspot' = ANY(COALESCE(psr.category_tags, ARRAY[]::text[])))
    RETURNING psr.id
  `);
  stats.hotspot_tag_added = r4.rowCount;
  console.log(`  ✅ ${r4.rowCount} 행 category_tags 'hotspot' 추가`);

  // ━━━━━━ 5. place_nubi_reasons → nubi_reason (= COALESCE 옛 우선) ━━━━━━
  console.log('\n▶ 5. place_nubi_reasons → nubi_reason:');
  const r5 = await c.query(`
    UPDATE place_seed_raw psr
    SET nubi_reason = pnr.nubi_reason,
        evidence_url = COALESCE(psr.evidence_url, pnr.evidence_url),
        evidence_verified = COALESCE(psr.evidence_verified, pnr.verified)
    FROM _places_to_seedraw_mapping m
    JOIN place_nubi_reasons pnr ON pnr.place_id = m.places_id
    WHERE psr.id = m.seed_raw_id
      AND psr.nubi_reason IS NULL
    RETURNING psr.id
  `);
  stats.nubi_reason_filled = r5.rowCount;
  console.log(`  ✅ ${r5.rowCount} 행 nubi_reason 보강`);

  // ━━━━━━ 6. naver_blog_posts COUNT → naver_blog_count ━━━━━━
  console.log('\n▶ 6. naver_blog_posts COUNT → naver_blog_count:');
  const r6 = await c.query(`
    WITH counts AS (
      SELECT m.seed_raw_id, COUNT(*)::int AS cnt
      FROM _places_to_seedraw_mapping m
      JOIN naver_blog_posts nbp ON nbp.place_id = m.places_id
      GROUP BY m.seed_raw_id
    )
    UPDATE place_seed_raw psr
    SET naver_blog_count = GREATEST(COALESCE(psr.naver_blog_count, 0), counts.cnt)
    FROM counts
    WHERE psr.id = counts.seed_raw_id
    RETURNING psr.id
  `);
  stats.naver_count_updated = r6.rowCount;
  console.log(`  ✅ ${r6.rowCount} 행 naver_blog_count 보강`);

  if (DRY_RUN) {
    await c.query('ROLLBACK');
    console.log('\n🔵 DRY RUN ROLLBACK (= 실제 변경 0)');
  } else {
    await c.query('COMMIT');
    console.log('\n✅ COMMIT 완료');
  }

  console.log(`\n▶ 결과 요약:`);
  console.log(`  소요: ${((Date.now() - startTime) / 1000).toFixed(1)} 초`);
  console.table([stats]);

} catch (e) {
  await c.query('ROLLBACK');
  console.error('\n❌ ROLLBACK:', e.message);
  console.error(e.stack);
  process.exit(1);
}

await c.end();
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`${DRY_RUN ? 'DRY RUN' : 'REAL'} 완료`);
console.log('═══════════════════════════════════════════════════════════');

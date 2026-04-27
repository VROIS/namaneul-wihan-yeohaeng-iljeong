// 엘파소 카테고리별 image_url 보유 row 수 검증 (직접 pg, MCP 금지)
// 기대: vibe 5×6 + restaurant 10 = 40 곳 image_url IS NOT NULL
import 'dotenv/config';
import pg from 'pg';

const SUPA_URL = process.env.SUPA_URL || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
if (!SUPA_URL) { console.error('❌ SUPA_URL 미설정'); process.exit(1); }

const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('✅ DB 연결 OK\n');

try {
  // 1. 카테고리별 image_url 보유 분포
  const r1 = await db.query(`
    SELECT seed_category,
      COUNT(*) AS total_rows,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> '') AS with_image,
      COUNT(*) FILTER (WHERE image_url LIKE '%supabase%') AS google_cdn,
      COUNT(*) FILTER (WHERE image_url IS NULL) AS no_image
    FROM place_seed_raw
    WHERE city_id=101 AND collection_phase='bts2026'
    GROUP BY seed_category ORDER BY seed_category
  `);
  console.log('📊 카테고리별 이미지 분포:');
  console.table(r1.rows);

  // 2. 상위 N (vibe 5, restaurant 10) image_url 보유 비율
  const r2 = await db.query(`
    WITH ranked AS (
      SELECT seed_category, rank, name_en, image_url,
             CASE WHEN seed_category='restaurant' THEN 10 ELSE 5 END AS expected_top_n,
             ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY rank) AS rn
      FROM place_seed_raw
      WHERE city_id=101 AND collection_phase='bts2026'
        AND seed_category IN ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping')
    )
    SELECT seed_category,
      COUNT(*) FILTER (WHERE rn <= expected_top_n) AS top_n_total,
      COUNT(*) FILTER (WHERE rn <= expected_top_n AND image_url IS NOT NULL) AS top_n_with_image
    FROM ranked
    GROUP BY seed_category ORDER BY seed_category
  `);
  console.log('\n📊 상위 N 이미지 보유 (vibe=5, restaurant=10):');
  console.table(r2.rows);

  // 3. 합계
  const r3 = await db.query(`
    WITH ranked AS (
      SELECT seed_category, rank, image_url,
             CASE WHEN seed_category='restaurant' THEN 10 ELSE 5 END AS expected,
             ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY rank) AS rn
      FROM place_seed_raw
      WHERE city_id=101 AND collection_phase='bts2026'
        AND seed_category IN ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping')
    )
    SELECT
      COUNT(*) FILTER (WHERE rn <= expected) AS top_40_total,
      COUNT(*) FILTER (WHERE rn <= expected AND image_url IS NOT NULL) AS top_40_with_image,
      COUNT(*) FILTER (WHERE rn > expected) AS remaining_total,
      COUNT(*) FILTER (WHERE rn > expected AND image_url IS NULL) AS remaining_no_image
    FROM ranked
  `);
  const s = r3.rows[0];
  console.log('\n🎯 종합 결과:');
  console.log(`   상위 40 (Google cron 대상) = ${s.top_40_with_image}/${s.top_40_total} 이미지 확보`);
  console.log(`   잔여 ${s.remaining_total} (Wikipedia/Unsplash fallback 대상) = NULL ${s.remaining_no_image}`);

  if (parseInt(s.top_40_with_image) >= 35) {
    console.log('\n✅ 엘파소 = 거의 완벽 (top 40 ≥ 35 확보)');
  } else {
    console.log(`\n⚠️ 엘파소 top 40 부족 (${s.top_40_with_image}/40) — 내일 cron 보충 필요`);
  }

} catch (e) {
  console.error('❌', e.message);
} finally {
  await db.end();
}

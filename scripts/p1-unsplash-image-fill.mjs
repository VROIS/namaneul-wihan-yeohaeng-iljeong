// ⚠️ 수정금지(승인필요) — Unsplash 이미지 보강 (api_keys DB 자동 로드)
// 부족분 (image_url IS NULL) row 카테고리 키워드 검색 후 첫 결과 채택
//
// ⚠️ Unsplash = 일반 stock 사진. 실제 그 장소 보장 X.
//   "카테고리 분위기 fallback" 용도 (사용자 시각 검증 필수).
//
// 사용법:
//   node scripts/p1-unsplash-image-fill.mjs --city-id=101 --dry-run
//   node scripts/p1-unsplash-image-fill.mjs --city-id=101 --commit

import pg from 'pg';

const { Client } = pg;
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DRY_RUN = !args.commit;
const CITY_ID = parseInt(args['city-id'] || '101', 10);

// ⚠️ 수정금지(승인필요) — 카테고리별 Unsplash 키워드 매핑 (사용자 SSOT 카테고리)
const CATEGORY_KEYWORDS = {
  attraction: 'tourist attraction landmark',
  restaurant: 'restaurant food',
  healing: 'spa wellness park',
  adventure: 'outdoor adventure',
  hotspot: 'city downtown',
  heritage: 'historic monument',
};

async function getApiKey(db) {
  const r = await db.query("SELECT key_value FROM api_keys WHERE key_name = 'UNSPLASH_ACCESS_KEY' AND is_active = true");
  if (!r.rows.length) throw new Error('UNSPLASH_ACCESS_KEY 없음 (api_keys 테이블)');
  return r.rows[0].key_value;
}

async function searchUnsplash(query, accessKey) {
  // ⚠️ 수정금지(승인필요) — Unsplash Search API. per_page=1 = 첫 결과만
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  });
  if (!r.ok) throw new Error(`Unsplash HTTP ${r.status}`);
  const d = await r.json();
  if (!d.results || d.results.length === 0) return null;
  const photo = d.results[0];
  return {
    id: photo.id,
    image_url: photo.urls.regular,
    thumb_url: photo.urls.small,
    photographer: photo.user.name,
    photographer_url: photo.user.links.html,
    photo_url: photo.links.html,
  };
}

(async () => {
  console.log(`🚀 Unsplash 이미지 보강 (city_id=${CITY_ID}, ${DRY_RUN ? 'DRY' : 'COMMIT'})`);
  console.log(`⚠️  Unsplash = stock 사진. 실제 장소 보장 X. 사용자 시각 검증 필수.\n`);

  const SUPA = process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL;
  if (!SUPA) { console.error('❌ SUPA_URL 없음'); process.exit(1); }
  const client = new Client({ connectionString: SUPA, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const accessKey = await getApiKey(client);
  console.log(`✅ Unsplash key: ${accessKey.slice(0, 10)}...\n`);

  // 부족분 row + 첫 카테고리 추출
  const r = await client.query(`
    SELECT id, name_en, category_tags[1] AS primary_cat
    FROM place_seed_raw
    WHERE city_id = $1
      AND source = 'gemini_research_2026_04_26'
      AND (image_url IS NULL OR image_url = '')
      AND name_en IS NOT NULL
    ORDER BY id
  `, [CITY_ID]);

  console.log(`📊 부족분 = ${r.rows.length} row\n`);

  let matched = 0, failed = 0, skipped = 0;
  for (const row of r.rows) {
    const cat = row.primary_cat;
    const kw = CATEGORY_KEYWORDS[cat];
    if (!kw) {
      console.log(`  ⚠️ #${row.id} | 카테고리 매핑 없음 (${cat}) — skip`);
      skipped++;
      continue;
    }
    // 검색어 = 장소명 + 카테고리 키워드
    const query = `${row.name_en} ${kw}`;
    try {
      const result = await searchUnsplash(query, accessKey);
      if (!result) {
        console.log(`  ✗ #${row.id} [${cat}] | ${row.name_en} → NO RESULT`);
        failed++;
        await new Promise(res => setTimeout(res, 100));
        continue;
      }
      matched++;
      const attribution = `Photo by ${result.photographer} on Unsplash (${result.photo_url})`;
      console.log(`  ✓ #${row.id} [${cat}] | ${row.name_en} → ${result.photographer} | ${result.image_url.slice(0, 60)}...`);

      if (!DRY_RUN) {
        await client.query(`
          UPDATE place_seed_raw SET
            image_url = $1,
            best_image_url = COALESCE(best_image_url, $1)
          WHERE id = $2 AND (image_url IS NULL OR image_url = '')
        `, [result.image_url, row.id]);
      }
    } catch (e) {
      console.log(`  ❌ #${row.id} | ${row.name_en} → ${e.message}`);
      failed++;
    }
    // Unsplash 데모 = 50/hour = 72초 간격 권장 → 우리는 아껴서 1.5초 (40 row/min)
    await new Promise(res => setTimeout(res, 1500));
  }

  console.log(`\n📊 결과: 매칭 ${matched}/${r.rows.length} (실패 ${failed}, skip ${skipped})`);
  console.log(`⚠️  사용자 시각 검증 필수 — HTML 페이지에서 카테고리 분위기 사진 확인`);

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });

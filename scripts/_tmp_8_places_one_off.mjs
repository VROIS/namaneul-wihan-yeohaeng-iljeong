// 1회용 — 8 row Google Places 사진 받아서 Storage 업로드 + DB UPDATE
// 사용자 SSOT (2026-04-29):
//   - locationBias 없음 (좌표는 textQuery 안에)
//   - 카테고리 키워드 없음 (사람이 검색창에 치는 자연어 그대로)
//   - photos[0] 비어있으면 silent skip 금지 → 상세 로그
//   - 매칭 5km 사후 검증
// 실행 후 삭제 예정 (커밋 X)

import 'dotenv/config';
import pg from 'pg';

const SUPA_URL = process.env.SUPA_URL
  || process.env.SUPABASE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!SUPA_URL) { console.error('❌ SUPA_URL 미설정'); process.exit(1); }

const TARGET_IDS = [57050, 57084, 57086, 57072, 57075, 57110, 57112, 57309];

// ─── Helpers ─────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const US_STATES = {
  // 엘파소만 = TX, 다른 도시 미사용
  101: 'Texas',
};
const COUNTRY_EN = { US: 'United States', MX: 'Mexico' };

async function getApiKey(db, keyName) {
  const r = await db.query(
    "SELECT key_value FROM api_keys WHERE key_name = $1 AND is_active = true",
    [keyName]
  );
  if (!r.rows.length) throw new Error(`🚨 ${keyName} 없음`);
  return r.rows[0].key_value;
}

async function searchText(textQuery, apiKey) {
  const body = { textQuery, pageSize: 1 };  // locationBias 없음
  const FIELD_MASK = 'places.id,places.displayName,places.location,places.photos,places.userRatingCount';
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`searchText ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function fetchPhotoMedia(photoName, apiKey) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${apiKey}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`PhotoMedia ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function uploadToStorage(supabaseUrl, serviceKey, fileName, buffer) {
  const url = `${supabaseUrl}/storage/v1/object/place-images/${fileName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: buffer,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Storage 업로드 ${res.status}: ${t.slice(0, 200)}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/place-images/${fileName}`;
}

// ─── Main ─────────────────────────
const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('🚀 1회용: 8 row Google 사진 가져오기 (locationBias X, 카테고리 키워드 X)\n');

try {
  // 8 row + city 정보 로드
  const r = await db.query(`
    SELECT p.id, p.city_id, p.seed_category, p.rank, p.name_en,
           p.latitude::float AS lat, p.longitude::float AS lng,
           c.name_en AS city_name, c.country_code
    FROM place_seed_raw p
    JOIN cities c ON c.id = p.city_id
    WHERE p.id = ANY($1::int[])
    ORDER BY p.id
  `, [TARGET_IDS]);
  const rows = r.rows;
  console.log(`📋 대상 ${rows.length} row 로드\n`);

  // API keys
  const googleKey = await getApiKey(db, 'GOOGLE_MAPS_API_KEY');
  const supabaseKey = await getApiKey(db, 'SUPABASE_ANON_KEY');
  // SUPABASE_URL 추정 (cron 패턴 따라)
  const supabaseUrl = 'https://wxebceflvuythuodemro.supabase.co';
  console.log(`🔑 keys 로드 OK\n`);

  const results = [];

  for (const row of rows) {
    const state = US_STATES[row.city_id];
    const country = COUNTRY_EN[row.country_code] || row.country_code;
    const locParts = [row.city_name, state, country].filter(Boolean);
    const locStr = locParts.join(', ');

    // 자연어 textQuery: 이름 + 좌표 + 도시,주,국가
    const textQuery = `${row.name_en} ${row.lat.toFixed(6)},${row.lng.toFixed(6)} ${locStr}`;

    console.log(`\n🔎 [${row.id}] ${row.name_en} (${row.seed_category} rank ${row.rank})`);
    console.log(`   query: ${textQuery}`);

    try {
      // 1. searchText
      const resp = await searchText(textQuery, googleKey);
      if (!resp.places || resp.places.length === 0) {
        console.log(`   ❌ FAIL: places 비어있음`);
        console.log(`   raw: ${JSON.stringify(resp).slice(0, 300)}`);
        results.push({ id: row.id, status: 'fail', reason: 'no_place_match', raw: resp });
        continue;
      }

      const place = resp.places[0];
      const placeId = place.id;
      const placeName = place.displayName?.text || '(no name)';
      const placeLat = place.location?.latitude;
      const placeLng = place.location?.longitude;
      const userRatingCount = place.userRatingCount || 0;

      console.log(`   ✓ 매칭: ${placeName} (${placeId})`);
      console.log(`   매칭 좌표: ${placeLat}, ${placeLng} (사용자 리뷰: ${userRatingCount})`);

      // 2. 좌표 5km 검증
      if (placeLat && placeLng) {
        const dist = haversine(row.lat, row.lng, placeLat, placeLng);
        if (dist > 5) {
          console.log(`   ⚠️ 좌표 ${dist.toFixed(2)}km 어긋남 — 다른 장소 가능성, SKIP`);
          results.push({ id: row.id, status: 'fail', reason: 'coord_mismatch', dist, placeId });
          continue;
        }
        console.log(`   ✓ 좌표 일치 (${dist.toFixed(2)}km)`);
      }

      // 3. photos 검증
      if (!place.photos || place.photos.length === 0) {
        console.log(`   ❌ FAIL: photos 배열 비어있음 — Google placeId 자체에 사진 0`);
        console.log(`   raw place: ${JSON.stringify(place).slice(0, 500)}`);
        results.push({ id: row.id, status: 'fail', reason: 'no_photos_on_place', placeId });
        continue;
      }

      const photoName = place.photos[0].name;
      console.log(`   ✓ photos[0]: ${photoName.slice(0, 80)}`);

      // 4. PhotoMedia 다운로드
      const buffer = await fetchPhotoMedia(photoName, googleKey);
      console.log(`   ✓ 다운로드: ${(buffer.length / 1024).toFixed(1)} KB`);

      // 5. Supabase Storage 업로드
      const fileName = `${row.city_id}/${row.seed_category}/${row.id}.jpg`;
      const storageUrl = await uploadToStorage(supabaseUrl, supabaseKey, fileName, buffer);
      console.log(`   ✓ Storage: ${fileName}`);

      // 6. DB UPDATE
      await db.query(`
        UPDATE place_seed_raw
        SET image_url = $1,
            image_attribution = $2,
            image_updated_at = NOW(),
            google_place_id = COALESCE(google_place_id, $3)
        WHERE id = $4
      `, [storageUrl, `Photo via Google Places (${placeId})`, placeId, row.id]);

      console.log(`   ✅ DB UPDATE 완료`);
      results.push({ id: row.id, status: 'success', placeId, size: buffer.length, storageUrl });

      // API rate limit 매너 (1초 간격)
      await new Promise(r => setTimeout(r, 1000));

    } catch (e) {
      console.log(`   ❌ EXCEPTION: ${e.message}`);
      results.push({ id: row.id, status: 'fail', reason: 'exception', error: e.message });
    }
  }

  // 최종 요약
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 최종 결과');
  console.log('═'.repeat(70));
  const ok = results.filter(x => x.status === 'success');
  const fail = results.filter(x => x.status === 'fail');
  console.log(`성공: ${ok.length} / 실패: ${fail.length}`);
  console.log('');

  if (ok.length) {
    console.log('✅ 성공:');
    ok.forEach(x => console.log(`   [${x.id}] placeId=${x.placeId}, size=${(x.size / 1024).toFixed(1)} KB`));
  }
  if (fail.length) {
    console.log('\n❌ 실패 (사용자 보고 필요):');
    fail.forEach(x => console.log(`   [${x.id}] reason=${x.reason}${x.dist ? `, dist=${x.dist.toFixed(2)}km` : ''}${x.error ? `, error=${x.error.slice(0, 80)}` : ''}`));
  }

} catch (e) {
  console.error('❌ MAIN EXCEPTION:', e.message);
  process.exit(1);
} finally {
  await db.end();
}

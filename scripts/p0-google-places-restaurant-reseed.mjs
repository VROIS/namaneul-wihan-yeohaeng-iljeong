// ⚠️ 수정금지(승인필요) — Google Places API 식당 카테고리 재시드 (사용자 2026-04-25 승인)
//
// 목적: 식당 카테고리 데이터가 시드 시점부터 잘못됨 (예: El Paso rank 1='Salchipapa', rank 4='Taco', rank 13='Wendy's')
//       → Google Places Text Search Essentials + Place Photos 로 진짜 식당 30개 재시드
//
// 안전장치 5개 (사용자 €1,131 트라우마 방지, Agent 리서치 2026-04-25 권고):
//   1. ALLOWED_FIELDS 화이트리스트 + ATMOSPHERE_FIELDS 33개 차단 (필드마스크 검증)
//   2. searchNearby 함수 = 코드에 정의 안 함 (폭탄 SKU 자체 호출 불가)
//   3. DAILY_LIMIT 35 (Text Search 5 + Place Photos 30) 자체 카운터
//   4. Cloud Console quota cap (사용자 직접 설정): Nearby=0/day, Text Search=100/day, Photos=35/day
//   5. Cloud Billing 알람 (사용자 직접 설정): $1, $5, $20 트립와이어
//
// SKU 비용 (2026-04-25 정책):
//   - Text Search Essentials: $5/1k, 무료 10,000/월
//   - Place Photos: $7/1k, 무료 1,000/월 (마지노선)
//   - 1도시 = Text 5 + Photos 30 = $0 (10k+1k 무료 안)
//   - 월 30 도시 가능 (Photos 900 < 1,000)
//
// 모드:
//   --city=El_Paso         : 도시 명 (필수, cities.name_en 의 underscore 형식)
//   --dry-run              : 호출 0, 환경 검증만
//   --test-1-call          : Text Search 1번만 (청구 0 확인용)
//   (기본)                  : 전체 35 호출 + DB REPLACE
//
// 실행:
//   node scripts/p0-google-places-restaurant-reseed.mjs --city=El_Paso --dry-run
//   node scripts/p0-google-places-restaurant-reseed.mjs --city=El_Paso --test-1-call
//   node scripts/p0-google-places-restaurant-reseed.mjs --city=El_Paso

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';
const CITY_ARG = process.argv.find((a) => a.startsWith('--city='));
const CITY_NAME = CITY_ARG ? CITY_ARG.split('=')[1].replace(/_/g, ' ') : null;
const DRY_RUN = process.argv.includes('--dry-run');
const TEST_1 = process.argv.includes('--test-1-call');

if (!CITY_NAME) {
  console.error('❌ --city=Name 필수 (예: --city=El_Paso)');
  process.exit(1);
}

// ━━━━━━━━━━━━ 안전장치 #1: 필드마스크 화이트리스트 ━━━━━━━━━━━━

const ALLOWED_FIELDS = new Set([
  'places.id', 'places.displayName', 'places.location', 'places.formattedAddress',
  'places.photos', 'places.rating', 'places.userRatingCount', 'places.types', 'places.primaryType',
]);

// 폭탄 SKU 트리거 — Atmosphere 33개 필드 (Agent 리서치 2026-04-25)
const ATMOSPHERE_FIELDS = new Set([
  'allowsDogs', 'curbsidePickup', 'delivery', 'dineIn', 'editorialSummary',
  'evChargeAmenitySummary', 'evChargeOptions', 'fuelOptions', 'generativeSummary',
  'goodForChildren', 'goodForGroups', 'goodForWatchingSports', 'liveMusic',
  'menuForChildren', 'neighborhoodSummary', 'parkingOptions', 'paymentOptions',
  'outdoorSeating', 'reservable', 'restroom', 'reviews', 'reviewSummary',
  'routingSummaries', 'servesBeer', 'servesBreakfast', 'servesBrunch', 'servesCocktails',
  'servesCoffee', 'servesDessert', 'servesDinner', 'servesLunch', 'servesVegetarianFood',
  'servesWine', 'takeout',
]);

const FIELD_MASK = 'places.id,places.displayName,places.location,places.formattedAddress,places.photos,places.rating,places.userRatingCount';

function validateFieldMask(mask) {
  const fields = mask.split(',').map((f) => f.trim());
  for (const f of fields) {
    const bare = f.replace(/^places\./, '');
    if (ATMOSPHERE_FIELDS.has(bare)) {
      throw new Error(`🚨 BLOCKED Atmosphere field: ${f} — 폭탄 SKU ($40/1k) 위험. 호출 차단.`);
    }
    if (!ALLOWED_FIELDS.has(f)) {
      throw new Error(`🚨 NOT WHITELISTED: ${f} — 알려지지 않은 필드. 호출 차단.`);
    }
  }
  return true;
}

validateFieldMask(FIELD_MASK);
console.log('✅ 안전장치 #1: 필드마스크 화이트리스트 검증 통과');

// ━━━━━━━━━━━━ 안전장치 #3: DAILY_LIMIT 자체 카운터 ━━━━━━━━━━━━

const DAILY_LIMIT = 35;
let textSearchCalls = 0;
let placePhotoCalls = 0;
let totalCalls = 0;

function checkLimit(skuName) {
  if (totalCalls >= DAILY_LIMIT) {
    throw new Error(`🚨 DAILY_LIMIT ${DAILY_LIMIT} 초과 — 폭탄 방지 차단. (${skuName})`);
  }
}

// ━━━━━━━━━━━━ Google Places API 호출 (안전 SKU 전용) ━━━━━━━━━━━━

async function getApiKey() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();
  const r = await db.query("SELECT key_value FROM api_keys WHERE key_name = 'GOOGLE_MAPS_API_KEY'");
  await db.end();
  if (!r.rows.length) throw new Error('GOOGLE_MAPS_API_KEY 없음');
  return r.rows[0].key_value;
}

async function textSearch(query, apiKey) {
  checkLimit('Text Search Essentials');
  validateFieldMask(FIELD_MASK); // 호출 직전 재검증

  console.log(`  📡 Text Search: "${query}" (호출 ${++totalCalls}/${DAILY_LIMIT})`);
  textSearchCalls++;

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, pageSize: 20 }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Text Search 실패 ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.places || [];
}

async function getPhotoUrl(photoName, apiKey) {
  checkLimit('Place Photos');

  console.log(`  📷 Place Photos: ${photoName.slice(0, 50)}... (호출 ${++totalCalls}/${DAILY_LIMIT})`);
  placePhotoCalls++;

  const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${apiKey}&skipHttpRedirect=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Place Photos 실패 ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.photoUri || null;
}

// ━━━━━━━━━━━━ 메인 실행 ━━━━━━━━━━━━

console.log(`\n🚀 [Google Places 식당 재시드] 도시=${CITY_NAME}`);
console.log(`   모드: ${DRY_RUN ? 'DRY-RUN' : TEST_1 ? 'TEST-1-CALL' : 'REAL'}`);

const apiKey = await getApiKey();
console.log(`✅ API key 로드: ${apiKey.slice(0, 8)}... (length=${apiKey.length})`);

if (DRY_RUN) {
  console.log('\n🔄 DRY-RUN: 호출 0, 환경 검증만 완료');
  process.exit(0);
}

// 도시 ID 조회
const db = new pg.Client({ connectionString: SUPA_URL });
await db.connect();
const cityRes = await db.query('SELECT id, name_en FROM cities WHERE name_en = $1', [CITY_NAME]);
if (!cityRes.rows.length) {
  console.error(`❌ 도시 "${CITY_NAME}" 없음`);
  await db.end();
  process.exit(1);
}
const cityId = cityRes.rows[0].id;
console.log(`✅ City: ${CITY_NAME} (id=${cityId})`);

// 다양한 검색어로 식당 풀 확보
const queries = TEST_1
  ? [`best restaurants in ${CITY_NAME}`]
  : [
      `best restaurants in ${CITY_NAME}`,
      `popular restaurants ${CITY_NAME}`,
      `top rated restaurants ${CITY_NAME}`,
      `local favorite restaurants ${CITY_NAME}`,
      `fine dining ${CITY_NAME}`,
    ];

const placesByid = new Map(); // place_id → place

console.log(`\n📡 Text Search 시작 (${queries.length}개 쿼리)`);
for (const q of queries) {
  try {
    const results = await textSearch(q, apiKey);
    for (const p of results) {
      if (!placesByid.has(p.id)) placesByid.set(p.id, p);
    }
    console.log(`     → 누적 고유 식당: ${placesByid.size}`);
  } catch (e) {
    console.error(`  ❌ ${e.message}`);
    await db.end();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n✅ Text Search 완료. 고유 식당 ${placesByid.size}개 확보`);

if (TEST_1) {
  console.log('\n🧪 TEST-1-CALL: Text Search 1건 응답 검증 완료. Photos 호출 X.');
  console.log('샘플 5건:');
  Array.from(placesByid.values()).slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.displayName?.text} (rating=${p.rating}, reviews=${p.userRatingCount})`);
  });
  console.log(`\n호출 합계: Text Search ${textSearchCalls} / Photos ${placePhotoCalls} / 총 ${totalCalls}`);
  await db.end();
  process.exit(0);
}

// rating 우선 정렬 → 30개 선택
const sorted = Array.from(placesByid.values())
  .filter((p) => p.photos && p.photos.length > 0 && p.rating)
  .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.userRatingCount || 0) - (a.userRatingCount || 0))
  .slice(0, 30);

console.log(`\n🎯 상위 30개 선택 (rating + reviews 정렬)`);

// Place Photos 호출 + 결과 수집
const final = [];
for (let i = 0; i < sorted.length; i++) {
  const p = sorted[i];
  const photoName = p.photos[0].name;
  try {
    const photoUrl = await getPhotoUrl(photoName, apiKey);
    final.push({
      rank: i + 1,
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      reviews: p.userRatingCount,
      photoUrl,
    });
  } catch (e) {
    console.error(`  ⚠️  rank ${i + 1} (${p.displayName?.text}) 사진 실패: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 200));
}

console.log(`\n✅ 사진 확보: ${final.length}/${sorted.length}`);

// DB REPLACE: 기존 식당 30 rows DELETE → 새 30 rows INSERT
console.log(`\n💾 DB REPLACE 시작 (city_id=${cityId}, category=restaurant)`);
await db.query('BEGIN');
try {
  const del = await db.query(
    `DELETE FROM place_seed_raw WHERE city_id = $1 AND seed_category = 'restaurant' AND collection_phase = 'bts2026'`,
    [cityId]
  );
  console.log(`  DELETE 기존: ${del.rowCount} rows`);

  for (const f of final) {
    await db.query(
      `INSERT INTO place_seed_raw (city_id, name_en, latitude, longitude, seed_category, rank, image_url, collection_phase)
       VALUES ($1, $2, $3, $4, 'restaurant', $5, $6, 'bts2026')`,
      [cityId, f.name, f.lat, f.lng, f.rank, f.photoUrl]
    );
  }
  console.log(`  INSERT 신규: ${final.length} rows`);

  await db.query('COMMIT');
  console.log('\n✅ COMMIT 완료');
} catch (e) {
  await db.query('ROLLBACK');
  console.error(`\n❌ DB 오류: ${e.message}, 롤백`);
  throw e;
}

console.log(`\n=== 합계 ===`);
console.log(`Text Search: ${textSearchCalls} 호출 (한도 10,000/월 무료, 안전 마진 ${((10000 - textSearchCalls) / 10000 * 100).toFixed(1)}%)`);
console.log(`Place Photos: ${placePhotoCalls} 호출 (한도 1,000/월 무료, 안전 마진 ${((1000 - placePhotoCalls) / 1000 * 100).toFixed(1)}%)`);
console.log(`총 호출: ${totalCalls}/${DAILY_LIMIT}`);

console.log(`\n=== 신규 식당 30개 (rating 순) ===`);
console.table(final.slice(0, 30).map((f) => ({
  rank: f.rank, name: f.name.slice(0, 35), rating: f.rating, reviews: f.reviews,
})));

await db.end();

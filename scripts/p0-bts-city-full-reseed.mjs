// ⚠️ 수정금지(승인필요) — BTS 1도시 6카테고리 풀 재시드 (사용자 2026-04-25 승인)
//
// 사용자 원래 로직 (mcp-raw-service.ts:85-109):
//   [선정 기준 3개] 1) 구글 검색량 2) 구글 리뷰 수 (평점 아님) 3) 구글 이미지 검색 결과 수
//
// 데이터 소스:
//   - 이름·정렬 = Google Places Text Search Essentials (필드마스크 잠금, 무료 10,000/월)
//   - 이미지 1차 = Wikipedia REST /page/summary/{name} (무료 무제한)
//   - 이미지 2차 = Google Place Photos (무료 1,000/월, 식당 우선)
//
// 정렬 로직 (사용자 원래 의도):
//   1차: userRatingCount DESC (실제 방문 인원, 평점 테러 영향 X)
//   2차: photos.length DESC (구글 핫스팟 알고리즘과 동일 = 카메라 마크 원리)
//   평점 = 사용 X (사용자 명시: "우리 몫 아님")
//   필터: userRatingCount >= 100 + photos.length > 0
//
// 안전장치 5개 (사용자 €1,131 트라우마 방지):
//   1. ALLOWED_FIELDS 화이트리스트 + ATMOSPHERE_FIELDS 33개 차단
//   2. searchNearby = 코드에 정의 안 함
//   3. PHOTOS_DAILY_LIMIT 35 (Photos 마지노선 1,000/30일)
//   4. Cloud Console quota cap (사용자 직접): Nearby=0/day
//   5. Cloud Billing 알람 (사용자 직접): $1, $5, $20
//
// 호출 분배 (1도시 6카테고리):
//   - Text Search Essentials: 5 × 6 = 30/도시 (무료 한도 0.3% 사용)
//   - Wikipedia REST: 30 × 6 = 180/도시 (무제한)
//   - Place Photos: 식당 30 + 다른 카테고리 Wiki 매칭 실패만 (PHOTOS_DAILY_LIMIT 35 한도 보호)
//
// 모드:
//   --city=El_Paso         : 도시명 (cities.name_en, underscore 형식, 필수)
//   --dry-run              : 호출 0
//   --test-1-call          : Text Search 1번만 (식당 카테고리)
//   (기본)                  : 전체 6 카테고리 + DB REPLACE
//
// 실행:
//   node scripts/p0-bts-city-full-reseed.mjs --city=El_Paso

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';
const UA = 'NubiBot/1.0 (vibetrip; contact@vibetrip.app)';
const CITY_ARG = process.argv.find((a) => a.startsWith('--city='));
const CITY_NAME = CITY_ARG ? CITY_ARG.split('=')[1].replace(/_/g, ' ') : null;
const DRY_RUN = process.argv.includes('--dry-run');
const TEST_1 = process.argv.includes('--test-1-call');

if (!CITY_NAME) {
  console.error('❌ --city=Name 필수');
  process.exit(1);
}

// ━━━━━━━━━━━ 안전장치 #1: 필드마스크 화이트리스트 ━━━━━━━━━━━
const ALLOWED_FIELDS = new Set([
  'places.id', 'places.displayName', 'places.location', 'places.formattedAddress',
  'places.photos', 'places.rating', 'places.userRatingCount', 'places.types', 'places.primaryType',
]);
const ATMOSPHERE_FIELDS = new Set([
  'allowsDogs','curbsidePickup','delivery','dineIn','editorialSummary','evChargeAmenitySummary',
  'evChargeOptions','fuelOptions','generativeSummary','goodForChildren','goodForGroups',
  'goodForWatchingSports','liveMusic','menuForChildren','neighborhoodSummary','parkingOptions',
  'paymentOptions','outdoorSeating','reservable','restroom','reviews','reviewSummary',
  'routingSummaries','servesBeer','servesBreakfast','servesBrunch','servesCocktails',
  'servesCoffee','servesDessert','servesDinner','servesLunch','servesVegetarianFood',
  'servesWine','takeout',
]);

const FIELD_MASK = 'places.id,places.displayName,places.location,places.formattedAddress,places.photos,places.rating,places.userRatingCount';

function validateFieldMask(mask) {
  for (const f of mask.split(',').map((x) => x.trim())) {
    const bare = f.replace(/^places\./, '');
    if (ATMOSPHERE_FIELDS.has(bare)) throw new Error(`🚨 BLOCKED Atmosphere: ${f}`);
    if (!ALLOWED_FIELDS.has(f)) throw new Error(`🚨 NOT WHITELISTED: ${f}`);
  }
}
validateFieldMask(FIELD_MASK);

// ━━━━━━━━━━━ 안전장치 #3: 일일 한도 ━━━━━━━━━━━
const PHOTOS_DAILY_LIMIT = 35;
const TEXT_DAILY_LIMIT = 100;
let textCalls = 0, photoCalls = 0, wikiCalls = 0;

function checkPhotos() {
  if (photoCalls >= PHOTOS_DAILY_LIMIT) throw new Error(`🚨 Photos DAILY_LIMIT ${PHOTOS_DAILY_LIMIT} 초과`);
}
function checkText() {
  if (textCalls >= TEXT_DAILY_LIMIT) throw new Error(`🚨 Text DAILY_LIMIT ${TEXT_DAILY_LIMIT} 초과`);
}

// ━━━━━━━━━━━ 도시 → location string 매핑 (사용자 2026-04-25 통찰) ━━━━━━━━━━━
// "미국 [주] [도시]" 패턴 → 글로벌 검색량 오염 차단 (HERITAGE Alhambra 사례)

const US_STATES = {
  'Tampa': 'Florida', 'El Paso': 'Texas', 'Stanford': 'California',
  'Las Vegas': 'Nevada', 'East Rutherford': 'New Jersey', 'Foxborough': 'Massachusetts',
  'Baltimore': 'Maryland', 'Arlington': 'Texas', 'Chicago': 'Illinois',
  'Los Angeles': 'California',
};

const COUNTRY_EN = {
  US: 'United States', MX: 'Mexico', KR: 'South Korea', ES: 'Spain',
  BE: 'Belgium', GB: 'United Kingdom', DE: 'Germany', FR: 'France',
  CA: 'Canada', CO: 'Colombia', PE: 'Peru', CL: 'Chile',
  AR: 'Argentina', BR: 'Brazil', TW: 'Taiwan', TH: 'Thailand',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', AU: 'Australia',
  HK: 'Hong Kong', PH: 'Philippines',
};

function buildLocationStr(city, countryCode) {
  if (countryCode === 'US' && US_STATES[city]) {
    return `${city}, ${US_STATES[city]}, United States`;
  }
  const country = COUNTRY_EN[countryCode];
  return country ? `${city}, ${country}` : city;
}

// ━━━━━━━━━━━ 카테고리별 검색어 (도시+주+국가 명시) ━━━━━━━━━━━
function buildQueries(category, locationStr) {
  const Q = {
    restaurant: [
      `best restaurants in ${locationStr}`,
      `popular restaurants in ${locationStr}`,
      `top rated restaurants in ${locationStr}`,
      `local favorite restaurants in ${locationStr}`,
      `fine dining in ${locationStr}`,
    ],
    heritage: [
      `historical sites in ${locationStr}`,
      `historic landmarks in ${locationStr}`,
      `museums in ${locationStr}`,
      `cultural heritage attractions in ${locationStr}`,
      `monuments in ${locationStr}`,
    ],
    hotspot: [
      `popular tourist attractions in ${locationStr}`,
      `top sights in ${locationStr}`,
      `must-see places in ${locationStr}`,
      `iconic landmarks in ${locationStr}`,
      `famous places in ${locationStr}`,
    ],
    healing: [
      `popular parks in ${locationStr}`,
      `gardens in ${locationStr}`,
      `nature spots in ${locationStr}`,
      `relaxing places in ${locationStr}`,
      `botanical garden in ${locationStr}`,
    ],
    adventure: [
      `theme parks in ${locationStr}`,
      `amusement parks in ${locationStr}`,
      `outdoor activities in ${locationStr}`,
      `family fun in ${locationStr}`,
      `entertainment venues in ${locationStr}`,
    ],
    shopping: [
      `popular shopping malls in ${locationStr}`,
      `shopping districts in ${locationStr}`,
      `outlets in ${locationStr}`,
      `markets in ${locationStr}`,
      `department stores in ${locationStr}`,
    ],
  };
  return Q[category] || [];
}

// ━━━━━━━━━━━ Google Places Text Search ━━━━━━━━━━━
async function textSearch(query, apiKey, regionCode, locationBias) {
  checkText();
  validateFieldMask(FIELD_MASK);
  textCalls++;

  const body = { textQuery: query, pageSize: 20 };
  if (regionCode) body.regionCode = regionCode.toLowerCase();  // "us", "mx" — 글로벌 결과 차단
  if (locationBias) body.locationBias = locationBias;  // 좌표 100km bias (검색 범위 제한)

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Text Search 실패 ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.places || [];
}

// ━━━━━━━━━━━ Wikipedia REST (Foxborough PoC 패턴) ━━━━━━━━━━━
async function wikipediaSummary(name) {
  wikiCalls++;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === 'disambiguation') return null;
    if (!data.thumbnail?.source) return null;
    return {
      thumbnail: data.thumbnail.source.replace(/\/\d+px-/, '/500px-'), // 500px 통일
      pageTitle: data.title,
      coords: data.coordinates ? { lat: data.coordinates.lat, lng: data.coordinates.lon } : null,
    };
  } catch { return null; }
}

// ━━━━━━━━━━━ Google Place Photos (잔여 only) ━━━━━━━━━━━
async function getPhotoUrl(photoName, apiKey) {
  checkPhotos();
  photoCalls++;
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=500&key=${apiKey}&skipHttpRedirect=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Photos 실패 ${res.status}: ${t.slice(0, 100)}`);
  }
  const data = await res.json();
  return data.photoUri || null;
}

// ━━━━━━━━━━━ 토큰 매칭 (Wikipedia 검증) ━━━━━━━━━━━
const STOP = new Set([
  'the','of','a','an','and','or','in','on','at','to','for','by','with','from',
  'restaurant','restaurants','cafe','park','museum','garden','mall','market','center','centre',
]);
function tokenize(s) {
  if (!s) return [];
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[\s\-_.,'"()\[\]!?#&%$/\\:;]+/)
    .filter((t) => t && t.length >= 2 && !STOP.has(t));
}
function matchRatio(name, target) {
  const nt = tokenize(name);
  if (nt.length === 0) return 0;
  const ft = new Set(tokenize(target));
  return nt.filter((t) => ft.has(t)).length / nt.length;
}

// ━━━━━━━━━━━ API key DB 로드 ━━━━━━━━━━━
async function getApiKey() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();
  const r = await db.query("SELECT key_value FROM api_keys WHERE key_name = 'GOOGLE_MAPS_API_KEY'");
  await db.end();
  if (!r.rows.length) throw new Error('GOOGLE_MAPS_API_KEY 없음');
  return r.rows[0].key_value;
}

// ━━━━━━━━━━━ 카테고리 1개 처리 ━━━━━━━━━━━
async function processCategory(category, cityName, apiKey, useGooglePhotos, locationStr, regionCode, locationBias) {
  console.log(`\n📂 [${category.toUpperCase()}] ${locationStr}`);

  // 1. Text Search 5번 (도시+주+국가 명시 + regionCode + locationBias)
  const queries = buildQueries(category, locationStr);
  const placesByid = new Map();
  for (const q of queries) {
    try {
      console.log(`  📡 Text: "${q.slice(0, 60)}..." (${textCalls + 1})`);
      const results = await textSearch(q, apiKey, regionCode, locationBias);
      for (const p of results) {
        if (!placesByid.has(p.id)) placesByid.set(p.id, p);
      }
    } catch (e) {
      console.error(`  ❌ Text 실패: ${e.message.slice(0, 100)}`);
    }
    await new Promise((r) => setTimeout(r, 600));  // 분당 한도 회피 (Text Search 도 분당 제한 발견됨)
  }
  console.log(`  ✅ ${placesByid.size}개 후보 확보`);

  // 2. 정렬 (사용자 원래 로직: reviews DESC > photos.length DESC, 평점 X)
  const sorted = Array.from(placesByid.values())
    .filter((p) => (p.userRatingCount || 0) >= 100 && p.photos?.length > 0)
    .sort((a, b) => {
      if ((b.userRatingCount || 0) !== (a.userRatingCount || 0)) {
        return (b.userRatingCount || 0) - (a.userRatingCount || 0);
      }
      return (b.photos?.length || 0) - (a.photos?.length || 0);
    })
    .slice(0, 30);

  console.log(`  🎯 정렬 후 상위 30 선택 (reviews >= 100 + photos > 0)`);

  // 3. 이미지 보강
  const final = [];
  let wikiHit = 0, photoUsed = 0, noImage = 0;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const name = p.displayName?.text || '';
    if (!name) continue;

    let imageUrl = null;
    let imageSource = null;

    // 1차: Wikipedia REST
    const wiki = await wikipediaSummary(name);
    if (wiki && matchRatio(name, wiki.pageTitle) >= 0.5) {
      imageUrl = wiki.thumbnail;
      imageSource = 'wikipedia';
      wikiHit++;
    } else if (useGooglePhotos && p.photos?.[0]?.name) {
      // 2차: Google Place Photos (식당만 또는 한도 안 시)
      try {
        if (photoCalls < PHOTOS_DAILY_LIMIT) {
          imageUrl = await getPhotoUrl(p.photos[0].name, apiKey);
          imageSource = 'google_places';
          photoUsed++;
          await new Promise((r) => setTimeout(r, 1500)); // 분당 한도 회피
        }
      } catch (e) {
        console.error(`  ⚠️  Photos 실패 (${name}): ${e.message.slice(0, 80)}`);
      }
    }

    if (!imageUrl) noImage++;

    final.push({
      rank: i + 1,
      name,
      address: p.formattedAddress || '',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      imageUrl,
      imageSource,
    });

    // Wikipedia rate limit (5 req/sec)
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`  📊 이미지: Wikipedia ${wikiHit} / Google Photos ${photoUsed} / 없음 ${noImage}`);
  return { category, sorted: final };
}

// ━━━━━━━━━━━ 메인 ━━━━━━━━━━━
console.log(`\n🚀 [BTS 1도시 풀 재시드] 도시=${CITY_NAME}`);
console.log(`   모드: ${DRY_RUN ? 'DRY-RUN' : TEST_1 ? 'TEST-1' : 'REAL'}`);

const apiKey = await getApiKey();
console.log(`✅ API key: ${apiKey.slice(0, 8)}... (length=${apiKey.length})`);

if (DRY_RUN) {
  console.log('\n🔄 DRY-RUN 종료');
  process.exit(0);
}

const db = new pg.Client({ connectionString: SUPA_URL });
await db.connect();
const cityRes = await db.query('SELECT id, country_code, latitude, longitude FROM cities WHERE name_en = $1', [CITY_NAME]);
if (!cityRes.rows.length) {
  console.error(`❌ 도시 "${CITY_NAME}" 없음`);
  await db.end();
  process.exit(1);
}
const cityId = cityRes.rows[0].id;
const countryCode = cityRes.rows[0].country_code;
const lat = cityRes.rows[0].latitude;
const lng = cityRes.rows[0].longitude;
const locationStr = buildLocationStr(CITY_NAME, countryCode);
const locationBias = (lat && lng) ? {
  circle: { center: { latitude: lat, longitude: lng }, radius: 100000 }  // 100km
} : null;
console.log(`✅ City ID: ${cityId} | location: "${locationStr}" | bias: ${locationBias ? '100km' : 'none'}`);

// 6 카테고리 (식당 = useGooglePhotos true, 다른 = false 우선, 한도 여유 있으면 일부만)
const categories = TEST_1
  ? [{ name: 'restaurant', usePhotos: true }]
  : [
      { name: 'restaurant', usePhotos: true },   // 식당 = Photos 필수
      { name: 'heritage', usePhotos: false },    // 다른 카테고리 = Wikipedia 만
      { name: 'hotspot', usePhotos: false },
      { name: 'healing', usePhotos: false },
      { name: 'adventure', usePhotos: false },
      { name: 'shopping', usePhotos: false },
    ];

const allResults = [];
for (const cat of categories) {
  const r = await processCategory(cat.name, CITY_NAME, apiKey, cat.usePhotos, locationStr, countryCode, locationBias);
  allResults.push(r);
}

// DB REPLACE
console.log(`\n💾 DB REPLACE 시작 (city_id=${cityId})`);
await db.query('BEGIN');
try {
  for (const { category, sorted } of allResults) {
    const del = await db.query(
      `DELETE FROM place_seed_raw WHERE city_id = $1 AND seed_category = $2 AND collection_phase = 'bts2026'`,
      [cityId, category]
    );
    console.log(`  ${category}: DELETE ${del.rowCount} → INSERT ${sorted.length}`);
    for (const f of sorted) {
      await db.query(
        `INSERT INTO place_seed_raw (city_id, name_en, latitude, longitude, seed_category, rank, image_url, collection_phase)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'bts2026')`,
        [cityId, f.name, f.lat, f.lng, category, f.rank, f.imageUrl]
      );
    }
  }
  await db.query('COMMIT');
  console.log('\n✅ COMMIT 완료');
} catch (e) {
  await db.query('ROLLBACK');
  console.error(`❌ DB 오류: ${e.message}`);
  throw e;
}

// 합계
console.log(`\n=== 호출 합계 ===`);
console.log(`Text Search: ${textCalls}/${TEXT_DAILY_LIMIT} (월 무료 10,000)`);
console.log(`Place Photos: ${photoCalls}/${PHOTOS_DAILY_LIMIT} (월 무료 1,000)`);
console.log(`Wikipedia REST: ${wikiCalls} (무제한)`);

console.log(`\n=== 카테고리별 결과 ===`);
console.table(allResults.map((r) => {
  const wikiCount = r.sorted.filter((s) => s.imageSource === 'wikipedia').length;
  const photoCount = r.sorted.filter((s) => s.imageSource === 'google_places').length;
  const noImg = r.sorted.filter((s) => !s.imageUrl).length;
  return {
    category: r.category, total: r.sorted.length,
    wiki: wikiCount, google: photoCount, no_image: noImg,
  };
}));

await db.end();

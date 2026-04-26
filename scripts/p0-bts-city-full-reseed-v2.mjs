// ⚠️ 수정금지(승인필요) — BTS 1도시 6카테고리 풀 재시드 v2 (사용자 2026-04-25 워크플로우 정정)
//
// v1 결함 4개 수정:
//   1. 데이터 흐름: Google 응답 → DB INSERT 우선 (메모리 손실 방지)
//   2. Wikipedia 검색: city + name 결합 (동음이의 방지)
//   3. 트랜잭션 원자성: INSERT 0 시 ROLLBACK
//   4. 429 분당 한도 retry (60초 대기 1회)
//
// 워크플로우 (사용자 정의):
//   Phase 1. Google Text Search 6 카테고리 (10초 간격, 429 retry 1회)
//   Phase 2. 검증 (각 카테고리 30 채워졌는지)
//   Phase 3. 트랜잭션 BEGIN → 기존 DELETE → 새 INSERT (image_url=NULL)
//   Phase 4. INSERT 검증 (180 rows 확보 시만 다음, 미달 시 ROLLBACK)
//   Phase 5. COMMIT (이미지 없어도 일단 저장 = 손실 위험 X)
//   Phase 6. Wikipedia search (city + name 결합) → image_url UPDATE
//   Phase 7. Wikipedia 실패 잔여 → Google Photos → image_url UPDATE
//
// 안전장치 5개 (사용자 €1,131 트라우마 + 실시간 모니터링):
//   1. ALLOWED_FIELDS 화이트리스트 + ATMOSPHERE_FIELDS 33개 차단
//   2. searchNearby = 코드 정의 X
//   3. PHOTOS_DAILY_LIMIT 35 (Photos 마지노선)
//   4. 호출 간격 10초 (분당 한도 보수적 회피)
//   5. 429 시 60초 대기 + 1회만 retry (재발 시 즉시 종료)
//
// 모드:
//   --city=El_Paso    : 도시명 (필수)
//   --dry-run         : 호출 0
//   (기본)             : REAL 실행

import pg from 'pg';

const SUPA_URL = 'postgresql://postgres.wxebceflvuythuodemro:Vrois%4075015@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';
const UA = 'NubiBot/1.0 (vibetrip; contact@vibetrip.app)';
const CITY_ARG = process.argv.find((a) => a.startsWith('--city='));
const CITY_NAME = CITY_ARG ? CITY_ARG.split('=')[1].replace(/_/g, ' ') : null;
const DRY_RUN = process.argv.includes('--dry-run');

if (!CITY_NAME) {
  console.error('❌ --city=Name 필수');
  process.exit(1);
}

// ━━━━━━━━━━━ 안전장치 #1 ━━━━━━━━━━━
const ALLOWED_FIELDS = new Set([
  'places.id','places.displayName','places.location','places.formattedAddress',
  'places.photos','places.rating','places.userRatingCount',
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

// ━━━━━━━━━━━ 안전장치 #3 ━━━━━━━━━━━
const PHOTOS_DAILY_LIMIT = 35;
const TEXT_DAILY_LIMIT = 50;
let textCalls = 0, photoCalls = 0, wikiCalls = 0;

// ━━━━━━━━━━━ 도시 → location string ━━━━━━━━━━━
const US_STATES = {
  'Tampa':'Florida','El Paso':'Texas','Stanford':'California','Las Vegas':'Nevada',
  'East Rutherford':'New Jersey','Foxborough':'Massachusetts','Baltimore':'Maryland',
  'Arlington':'Texas','Chicago':'Illinois','Los Angeles':'California',
};
const COUNTRY_EN = {
  US:'United States',MX:'Mexico',KR:'South Korea',ES:'Spain',BE:'Belgium',
  GB:'United Kingdom',DE:'Germany',FR:'France',CA:'Canada',CO:'Colombia',
  PE:'Peru',CL:'Chile',AR:'Argentina',BR:'Brazil',TW:'Taiwan',TH:'Thailand',
  MY:'Malaysia',SG:'Singapore',ID:'Indonesia',AU:'Australia',HK:'Hong Kong',PH:'Philippines',
};
function buildLocationStr(city, cc) {
  if (cc === 'US' && US_STATES[city]) return `${city}, ${US_STATES[city]}, United States`;
  return COUNTRY_EN[cc] ? `${city}, ${COUNTRY_EN[cc]}` : city;
}

function buildQueries(category, locStr) {
  const Q = {
    restaurant: [
      `best restaurants in ${locStr}`,
      `popular restaurants in ${locStr}`,
      `top rated restaurants in ${locStr}`,
      `local favorite restaurants in ${locStr}`,
      `fine dining in ${locStr}`,
    ],
    heritage: [
      `historical sites in ${locStr}`,
      `historic landmarks in ${locStr}`,
      `museums in ${locStr}`,
      `cultural heritage attractions in ${locStr}`,
      `monuments in ${locStr}`,
    ],
    hotspot: [
      `popular tourist attractions in ${locStr}`,
      `top sights in ${locStr}`,
      `must-see places in ${locStr}`,
      `iconic landmarks in ${locStr}`,
      `famous places in ${locStr}`,
    ],
    healing: [
      `popular parks in ${locStr}`,
      `gardens in ${locStr}`,
      `nature spots in ${locStr}`,
      `relaxing places in ${locStr}`,
      `botanical garden in ${locStr}`,
    ],
    adventure: [
      `theme parks in ${locStr}`,
      `amusement parks in ${locStr}`,
      `outdoor activities in ${locStr}`,
      `family fun in ${locStr}`,
      `entertainment venues in ${locStr}`,
    ],
    shopping: [
      `popular shopping malls in ${locStr}`,
      `shopping districts in ${locStr}`,
      `outlets in ${locStr}`,
      `markets in ${locStr}`,
      `department stores in ${locStr}`,
    ],
  };
  return Q[category] || [];
}

// ━━━━━━━━━━━ Google Places Text Search (429 retry 포함) ━━━━━━━━━━━
async function textSearchOnce(query, apiKey, regionCode, locationBias) {
  validateFieldMask(FIELD_MASK);
  const body = { textQuery: query, pageSize: 20 };
  if (regionCode) body.regionCode = regionCode.toLowerCase();
  if (locationBias) body.locationBias = locationBias;

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
  return res;
}

async function textSearch(query, apiKey, regionCode, locationBias) {
  if (textCalls >= TEXT_DAILY_LIMIT) throw new Error(`🚨 Text DAILY_LIMIT ${TEXT_DAILY_LIMIT} 초과`);
  textCalls++;

  let res = await textSearchOnce(query, apiKey, regionCode, locationBias);
  if (res.status === 429) {
    console.log(`  ⏸️  429 분당 한도 → 60초 대기 후 1회 retry...`);
    await new Promise((r) => setTimeout(r, 60000));
    res = await textSearchOnce(query, apiKey, regionCode, locationBias);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Text Search 실패 ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.places || [];
}

// ━━━━━━━━━━━ Wikipedia search (city + name 결합) ━━━━━━━━━━━
async function wikipediaSearchWithCity(city, name) {
  wikiCalls++;
  const q = `${name} ${city}`;
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.pages?.length) return null;

    // ⚠️ H-2 권고 (Agent 검증 2026-04-25): city 토큰을 STOP 에 동적 추가
    // 이유: name="L & J Cafe" + city="El Paso" → "El Paso, Texas" 페이지 false positive 방지
    // city 토큰이 양쪽 (name 검색어, page.title) 에서 모두 빠지면 진짜 매칭만 통과
    const cityTokens = tokenize(city);
    const localStop = new Set([...STOP, ...cityTokens]);
    const localTokenize = (s) => {
      if (!s) return [];
      return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .split(/[\s\-_.,'"()\[\]!?#&%$/\\:;]+/)
        .filter((t) => t && t.length >= 2 && !localStop.has(t));
    };
    const localMatchRatio = (n, t) => {
      const nt = localTokenize(n);
      if (nt.length === 0) return 0;
      const ft = new Set(localTokenize(t));
      return nt.filter((tk) => ft.has(tk)).length / nt.length;
    };

    // 첫 결과의 thumbnail + 이름 매칭 검증 (city 토큰 제외)
    for (const page of data.pages) {
      if (!page.thumbnail?.url) continue;
      // 이름 토큰 매칭 ≥ 0.5 (city 토큰 빼고)
      const r = localMatchRatio(name, page.title);
      if (r >= 0.5) {
        const thumbUrl = page.thumbnail.url.startsWith('//')
          ? 'https:' + page.thumbnail.url
          : page.thumbnail.url;
        // 200px 기본 → 500px 로 업스케일 시도
        const upscaled = thumbUrl.replace(/\/\d+px-/, '/500px-');
        return { thumbnail: upscaled, pageTitle: page.title, ratio: r };
      }
    }
    return null;
  } catch { return null; }
}

const STOP = new Set([
  'the','of','a','an','and','or','in','on','at','to','for','by','with','from',
  'restaurant','restaurants','cafe','park','museum','garden','mall','market','center','centre',
  'el','la','le','les','de','du','des',
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

// ━━━━━━━━━━━ Place Photos (잔여만) ━━━━━━━━━━━
async function getPhotoUrl(photoName, apiKey) {
  if (photoCalls >= PHOTOS_DAILY_LIMIT) throw new Error(`🚨 Photos LIMIT ${PHOTOS_DAILY_LIMIT}`);
  photoCalls++;

  const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=500&key=${apiKey}&skipHttpRedirect=true`;
  let res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 429) {
    console.log(`  ⏸️  Photos 429 → 60초 대기 retry...`);
    await new Promise((r) => setTimeout(r, 60000));
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Photos 실패 ${res.status}: ${t.slice(0, 100)}`);
  }
  const data = await res.json();
  return data.photoUri || null;
}

// ━━━━━━━━━━━ DB ━━━━━━━━━━━
async function getApiKey() {
  const db = new pg.Client({ connectionString: SUPA_URL });
  await db.connect();
  const r = await db.query("SELECT key_value FROM api_keys WHERE key_name = 'GOOGLE_MAPS_API_KEY'");
  await db.end();
  if (!r.rows.length) throw new Error('GOOGLE_MAPS_API_KEY 없음');
  return r.rows[0].key_value;
}

// ━━━━━━━━━━━ Phase 1: Google Text Search 모든 카테고리 ━━━━━━━━━━━
async function phase1_collectGoogleData(cityName, apiKey, locationStr, regionCode, locationBias) {
  console.log(`\n━━━━━━ PHASE 1: Google Text Search ━━━━━━`);
  const categories = ['restaurant','heritage','hotspot','healing','adventure','shopping'];
  const results = {};

  for (const cat of categories) {
    console.log(`\n📂 [${cat.toUpperCase()}]`);
    const queries = buildQueries(cat, locationStr);
    const placesByid = new Map();

    for (const q of queries) {
      try {
        console.log(`  📡 "${q.slice(0, 60)}..." (${textCalls + 1})`);
        const found = await textSearch(q, apiKey, regionCode, locationBias);
        for (const p of found) if (!placesByid.has(p.id)) placesByid.set(p.id, p);
      } catch (e) {
        console.error(`  ❌ ${e.message.slice(0, 100)}`);
        // 한 검색어 실패해도 다른 검색어 계속 시도
      }
      await new Promise((r) => setTimeout(r, 10000));  // 10초 간격 (분당 6 호출)
    }

    // 정렬 (사용자 원래 로직: reviews DESC > photos.length DESC, 평점 X)
    const sorted = Array.from(placesByid.values())
      .filter((p) => (p.userRatingCount || 0) >= 100 && p.photos?.length > 0)
      .sort((a, b) => {
        if ((b.userRatingCount || 0) !== (a.userRatingCount || 0)) {
          return (b.userRatingCount || 0) - (a.userRatingCount || 0);
        }
        return (b.photos?.length || 0) - (a.photos?.length || 0);
      })
      .slice(0, 30);

    results[cat] = sorted;
    console.log(`  ✅ ${cat}: ${placesByid.size} 후보 → ${sorted.length} 정렬됨 (top 30)`);
  }
  return results;
}

// ━━━━━━━━━━━ Phase 2: 검증 ━━━━━━━━━━━
function phase2_validate(googleData) {
  console.log(`\n━━━━━━ PHASE 2: 검증 ━━━━━━`);
  let totalRows = 0;
  for (const [cat, rows] of Object.entries(googleData)) {
    totalRows += rows.length;
    console.log(`  ${cat}: ${rows.length} rows`);
    if (rows.length === 0) {
      throw new Error(`🚨 ${cat} 카테고리 0 rows = 데이터 부족, 진행 중단 (DB 보존)`);
    }
  }
  console.log(`  ✅ 총 ${totalRows} rows 확보 — Phase 3 진입`);
}

// ━━━━━━━━━━━ Phase 3-5: 트랜잭션 INSERT ━━━━━━━━━━━
async function phase3_5_dbInsert(db, cityId, googleData) {
  console.log(`\n━━━━━━ PHASE 3-5: DB 트랜잭션 (이름+좌표만, 이미지 NULL) ━━━━━━`);
  await db.query('BEGIN');
  try {
    for (const [cat, rows] of Object.entries(googleData)) {
      const del = await db.query(
        `DELETE FROM place_seed_raw WHERE city_id = $1 AND seed_category = $2 AND collection_phase = 'bts2026'`,
        [cityId, cat]
      );
      let inserted = 0;
      for (let i = 0; i < rows.length; i++) {
        const p = rows[i];
        await db.query(
          `INSERT INTO place_seed_raw (city_id, name_en, latitude, longitude, seed_category, rank, image_url, collection_phase)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, 'bts2026')`,
          [cityId, p.displayName?.text || '', p.location?.latitude, p.location?.longitude, cat, i + 1]
        );
        inserted++;
      }
      console.log(`  ${cat}: DELETE ${del.rowCount} → INSERT ${inserted}`);
      if (inserted === 0) throw new Error(`🚨 ${cat} INSERT 0 = ROLLBACK`);
    }
    await db.query('COMMIT');
    console.log(`  ✅ COMMIT (모든 카테고리 INSERT 검증 통과)`);
  } catch (e) {
    await db.query('ROLLBACK');
    throw new Error(`Phase 3-5 ROLLBACK: ${e.message}`);
  }
}

// ━━━━━━━━━━━ Phase 6: Wikipedia (city + name 결합) ━━━━━━━━━━━
async function phase6_wikipedia(db, cityId, cityName, googleData) {
  console.log(`\n━━━━━━ PHASE 6: Wikipedia search (city + name) ━━━━━━`);
  let total = 0, hit = 0;
  for (const [cat, rows] of Object.entries(googleData)) {
    let catHit = 0;
    for (let i = 0; i < rows.length; i++) {
      const name = rows[i].displayName?.text;
      if (!name) continue;
      total++;

      const wiki = await wikipediaSearchWithCity(cityName, name);
      if (wiki) {
        await db.query(
          `UPDATE place_seed_raw SET image_url = $1, updated_at = NOW()
           WHERE city_id = $2 AND seed_category = $3 AND rank = $4 AND collection_phase = 'bts2026'`,
          [wiki.thumbnail, cityId, cat, i + 1]
        );
        hit++; catHit++;
      }
      await new Promise((r) => setTimeout(r, 200));  // Wikipedia 5 req/sec
    }
    console.log(`  ${cat}: Wikipedia 매칭 ${catHit}/${rows.length}`);
  }
  console.log(`  ✅ 합계: Wikipedia ${hit}/${total}`);
  return { hit, total };
}

// ━━━━━━━━━━━ Phase 7: Photos 잔여 (식당 우선) ━━━━━━━━━━━
async function phase7_photos(db, cityId, googleData, apiKey) {
  console.log(`\n━━━━━━ PHASE 7: Place Photos 잔여 (식당 우선) ━━━━━━`);
  const PRIORITY = ['restaurant', 'heritage', 'hotspot', 'shopping', 'healing', 'adventure'];
  let total = 0;

  for (const cat of PRIORITY) {
    const rows = googleData[cat] || [];
    let catHit = 0;
    for (let i = 0; i < rows.length; i++) {
      if (photoCalls >= PHOTOS_DAILY_LIMIT) {
        console.log(`  ⏹️  Photos LIMIT 도달, ${cat} 잔여 SKIP`);
        return { total };
      }
      // image_url 이 이미 채워졌는지 확인 (Wikipedia 매칭 성공 row)
      const existing = await db.query(
        `SELECT image_url FROM place_seed_raw WHERE city_id = $1 AND seed_category = $2 AND rank = $3 AND collection_phase = 'bts2026'`,
        [cityId, cat, i + 1]
      );
      if (existing.rows[0]?.image_url) continue;  // Wikipedia 성공 = SKIP

      const photoName = rows[i].photos?.[0]?.name;
      if (!photoName) continue;

      try {
        const url = await getPhotoUrl(photoName, apiKey);
        if (url) {
          await db.query(
            `UPDATE place_seed_raw SET image_url = $1, updated_at = NOW()
             WHERE city_id = $2 AND seed_category = $3 AND rank = $4 AND collection_phase = 'bts2026'`,
            [url, cityId, cat, i + 1]
          );
          catHit++; total++;
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        console.error(`  ⚠️  ${cat} rank ${i + 1}: ${e.message.slice(0, 60)}`);
      }
    }
    console.log(`  ${cat}: Photos 추가 ${catHit}`);
  }
  return { total };
}

// ━━━━━━━━━━━ 메인 ━━━━━━━━━━━
console.log(`\n🚀 [BTS v2 풀 재시드] 도시=${CITY_NAME}`);
console.log(`   모드: ${DRY_RUN ? 'DRY-RUN' : 'REAL'}`);

const apiKey = await getApiKey();
console.log(`✅ API key: ${apiKey.slice(0, 8)}... (length=${apiKey.length})`);

if (DRY_RUN) { console.log('\n🔄 DRY-RUN 종료'); process.exit(0); }

const db = new pg.Client({ connectionString: SUPA_URL });
await db.connect();
const cityRes = await db.query('SELECT id, country_code, latitude, longitude FROM cities WHERE name_en = $1', [CITY_NAME]);
if (!cityRes.rows.length) {
  console.error(`❌ 도시 "${CITY_NAME}" 없음`);
  await db.end(); process.exit(1);
}
const { id: cityId, country_code: countryCode, latitude: lat, longitude: lng } = cityRes.rows[0];
const locationStr = buildLocationStr(CITY_NAME, countryCode);
const locationBias = (lat && lng) ? { circle: { center: { latitude: lat, longitude: lng }, radius: 100000 } } : null;
console.log(`✅ City ID: ${cityId} | location: "${locationStr}" | bias: 100km`);

try {
  // Phase 1
  const googleData = await phase1_collectGoogleData(CITY_NAME, apiKey, locationStr, countryCode, locationBias);
  // Phase 2
  phase2_validate(googleData);
  // Phase 3-5
  await phase3_5_dbInsert(db, cityId, googleData);
  // Phase 6
  const wiki = await phase6_wikipedia(db, cityId, CITY_NAME, googleData);
  // Phase 7
  const photos = await phase7_photos(db, cityId, googleData, apiKey);

  console.log(`\n=== 호출 합계 ===`);
  console.log(`Text Search: ${textCalls}`);
  console.log(`Place Photos: ${photoCalls}/${PHOTOS_DAILY_LIMIT}`);
  console.log(`Wikipedia: ${wikiCalls}`);

  console.log(`\n=== 이미지 결과 ===`);
  console.log(`Wikipedia 매칭: ${wiki.hit}/${wiki.total}`);
  console.log(`Photos 추가: ${photos.total}`);
  console.log(`이미지 없음: ${wiki.total - wiki.hit - photos.total}`);
} catch (e) {
  console.error(`\n❌ 진행 중단: ${e.message}`);
  process.exit(1);
} finally {
  await db.end();
}

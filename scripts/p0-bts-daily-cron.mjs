// ⚠️ 수정금지(승인필요) — BTS 일일 자동 cron 재시드 (사용자 2026-04-25 승인, GitHub Actions B)
//
// 사용자 의도:
//   - 매일 PT 자정+30분 자동 실행 (UTC 08:30, quota reset 직후)
//   - 1도시 자동 선택 (공연 임박 순 + 미처리/부족 데이터)
//   - 6 카테고리 랭킹 재정비 (사용자 통찰: reviews + photos.length, 평점 X)
//   - Wikipedia 우선 → Photos 잔여 (식당 20 + 다른 10 = quota cap 30 정확)
//
// 호출 분배 (1도시):
//   - Text Search Essentials: 30 (5 × 6 카테고리) — quota cap 30/day 정확
//   - Wikipedia REST: 180 (30 × 6) — 무제한
//   - Place Photos: 30 (식당 20 + 다른 카테고리 잔여 10) — quota cap 30/day 정확
//
// 안전장치 5개 (v2 그대로):
//   1. ALLOWED_FIELDS + ATMOSPHERE 33개 차단
//   2. searchNearby 코드 정의 X
//   3. PHOTOS_DAILY_LIMIT 30 (사용자 cap 일치)
//   4. 호출 간격 10초 (Text), 1.5초 (Photos)
//   5. 429 retry 60초 1회만
//
// 도시 자동 선택 (DB 쿼리):
//   - bts_rank NOT NULL + bts_archived=false + (image_url 보유 < 100 또는 처리 미완)
//   - 공연 임박 순 (bts_concert_dates 가장 가까운 미래)
//   - 1개 선택
//
// 실행:
//   node scripts/p0-bts-daily-cron.mjs        (자동 도시 선택)
//   node scripts/p0-bts-daily-cron.mjs --city=Mexico_City  (수동)
//   node scripts/p0-bts-daily-cron.mjs --dry-run

import pg from 'pg';

// ⚠️ Agent 검증 FAIL 수정 (2026-04-25): DB 비밀번호 하드코드 fallback 제거
// SUPA_URL 환경변수 필수 (GitHub Secrets 또는 로컬 export)
const SUPA_URL = process.env.SUPA_URL;
if (!SUPA_URL) {
  console.error('❌ SUPA_URL 환경변수 미설정. GitHub Secrets 또는 export SUPA_URL=... 필요');
  process.exit(1);
}
const UA = 'NubiBot/1.0 (vibetrip; contact@vibetrip.app)';
const CITY_ARG = process.argv.find((a) => a.startsWith('--city='));
const MANUAL_CITY = CITY_ARG ? CITY_ARG.split('=')[1].replace(/_/g, ' ') : null;
const DRY_RUN = process.argv.includes('--dry-run');

// ━━━━━━ 안전장치 #1 ━━━━━━
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

// ━━━━━━ 일일 한도 (사용자 quota cap 일치) ━━━━━━
const PHOTOS_DAILY_LIMIT = 30;
const TEXT_DAILY_LIMIT = 30;
const RESTAURANT_PHOTOS = 20;  // 식당 카테고리 photos 한도 (사용자 명시)
const OTHER_PHOTOS = 10;       // 다른 5 카테고리 잔여 한도 (사용자 명시)
let textCalls = 0, photoCalls = 0, wikiCalls = 0, restaurantPhotoCalls = 0, otherPhotoCalls = 0;

// ━━━━━━ 도시 location string ━━━━━━
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
      `best restaurants in ${locStr}`,`popular restaurants in ${locStr}`,
      `top rated restaurants in ${locStr}`,`local favorite restaurants in ${locStr}`,
      `fine dining in ${locStr}`,
    ],
    heritage: [
      `historical sites in ${locStr}`,`historic landmarks in ${locStr}`,
      `museums in ${locStr}`,`cultural heritage attractions in ${locStr}`,
      `monuments in ${locStr}`,
    ],
    hotspot: [
      `popular tourist attractions in ${locStr}`,`top sights in ${locStr}`,
      `must-see places in ${locStr}`,`iconic landmarks in ${locStr}`,
      `famous places in ${locStr}`,
    ],
    healing: [
      `popular parks in ${locStr}`,`gardens in ${locStr}`,
      `nature spots in ${locStr}`,`relaxing places in ${locStr}`,
      `botanical garden in ${locStr}`,
    ],
    adventure: [
      `theme parks in ${locStr}`,`amusement parks in ${locStr}`,
      `outdoor activities in ${locStr}`,`family fun in ${locStr}`,
      `entertainment venues in ${locStr}`,
    ],
    shopping: [
      `popular shopping malls in ${locStr}`,`shopping districts in ${locStr}`,
      `outlets in ${locStr}`,`markets in ${locStr}`,
      `department stores in ${locStr}`,
    ],
  };
  return Q[category] || [];
}

// ━━━━━━ Google Text Search (429 retry) ━━━━━━
async function textSearchOnce(query, apiKey, regionCode, locationBias) {
  validateFieldMask(FIELD_MASK);
  const body = { textQuery: query, pageSize: 20 };
  if (regionCode) body.regionCode = regionCode.toLowerCase();
  if (locationBias) body.locationBias = locationBias;
  return await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
}

async function textSearch(query, apiKey, regionCode, locationBias) {
  if (textCalls >= TEXT_DAILY_LIMIT) throw new Error(`🚨 Text DAILY_LIMIT ${TEXT_DAILY_LIMIT} 초과`);
  textCalls++;
  let res = await textSearchOnce(query, apiKey, regionCode, locationBias);
  if (res.status === 429) {
    console.log(`  ⏸️  429 → 60초 대기 retry...`);
    await new Promise((r) => setTimeout(r, 60000));
    res = await textSearchOnce(query, apiKey, regionCode, locationBias);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Text Search 실패 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.places || [];
}

// ━━━━━━ Wikipedia (city + name) ━━━━━━
const STOP = new Set([
  'the','of','a','an','and','or','in','on','at','to','for','by','with','from',
  'restaurant','restaurants','cafe','park','museum','garden','mall','market','center','centre',
  'el','la','le','les','de','du','des',
]);
function tokenize(s, extraStop = new Set()) {
  if (!s) return [];
  const stopSet = new Set([...STOP, ...extraStop]);
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[\s\-_.,'"()\[\]!?#&%$/\\:;]+/)
    .filter((t) => t && t.length >= 2 && !stopSet.has(t));
}
function matchRatio(name, target, extraStop = new Set()) {
  const nt = tokenize(name, extraStop);
  if (nt.length === 0) return 0;
  const ft = new Set(tokenize(target, extraStop));
  return nt.filter((t) => ft.has(t)).length / nt.length;
}

async function wikipediaSearchWithCity(city, name) {
  wikiCalls++;
  const q = `${name} ${city}`;
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.pages?.length) return null;
    const cityStop = new Set(tokenize(city));
    for (const page of data.pages) {
      if (!page.thumbnail?.url) continue;
      if (matchRatio(name, page.title, cityStop) >= 0.5) {
        const thumbUrl = page.thumbnail.url.startsWith('//') ? 'https:' + page.thumbnail.url : page.thumbnail.url;
        return { thumbnail: thumbUrl.replace(/\/\d+px-/, '/500px-'), pageTitle: page.title };
      }
    }
    return null;
  } catch { return null; }
}

// ━━━━━━ Place Photos (식당 20 + 다른 10 분리) ━━━━━━
async function getPhotoUrl(photoName, apiKey, isRestaurant) {
  if (photoCalls >= PHOTOS_DAILY_LIMIT) throw new Error(`🚨 Photos LIMIT ${PHOTOS_DAILY_LIMIT}`);
  if (isRestaurant && restaurantPhotoCalls >= RESTAURANT_PHOTOS) {
    throw new Error(`RESTAURANT_PHOTOS ${RESTAURANT_PHOTOS} 도달`);
  }
  if (!isRestaurant && otherPhotoCalls >= OTHER_PHOTOS) {
    throw new Error(`OTHER_PHOTOS ${OTHER_PHOTOS} 도달`);
  }
  photoCalls++;
  if (isRestaurant) restaurantPhotoCalls++; else otherPhotoCalls++;

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

// ━━━━━━ DB ━━━━━━
async function getApiKey(db) {
  const r = await db.query("SELECT key_value FROM api_keys WHERE key_name = 'GOOGLE_MAPS_API_KEY'");
  if (!r.rows.length) throw new Error('GOOGLE_MAPS_API_KEY 없음');
  return r.rows[0].key_value;
}

// ━━━━━━ 자동 도시 선택 (공연 임박 + 미처리/부족) ━━━━━━
async function selectNextCity(db) {
  const r = await db.query(`
    SELECT c.id, c.name_en, c.country_code, c.latitude, c.longitude,
      (SELECT COUNT(*) FROM place_seed_raw psr
        WHERE psr.city_id = c.id AND psr.collection_phase = 'bts2026'
          AND psr.image_url IS NOT NULL) AS image_count,
      (SELECT MIN(d::date) FROM jsonb_array_elements_text(COALESCE(c.bts_concert_dates, '[]'::jsonb)) d
        WHERE d::date >= CURRENT_DATE) AS next_concert
    FROM cities c
    WHERE c.bts_rank IS NOT NULL AND COALESCE(c.bts_archived, false) = false
      AND c.name_en IN (
        'El Paso','Mexico City','Stanford','Las Vegas','Busan','Madrid','Brussels',
        'London','Munich','Paris','East Rutherford','Foxborough','Baltimore','Arlington',
        'Toronto','Chicago','Los Angeles','Bogota','Lima','Santiago','Buenos Aires',
        'Sao Paulo','Kaohsiung','Bangkok','Kuala Lumpur','Singapore','Jakarta','Melbourne',
        'Sydney','Hong Kong','Manila','Tampa'
      )
    ORDER BY
      (SELECT COUNT(*) FROM place_seed_raw psr
        WHERE psr.city_id = c.id AND psr.collection_phase = 'bts2026'
          AND psr.seed_category IN ('restaurant','heritage','hotspot','healing','adventure','shopping')
          AND psr.image_url IS NOT NULL) ASC,
      (SELECT MIN(d::date) FROM jsonb_array_elements_text(COALESCE(c.bts_concert_dates, '[]'::jsonb)) d
        WHERE d::date >= CURRENT_DATE) ASC NULLS LAST
    LIMIT 1
  `);
  return r.rows[0] || null;
}

// ━━━━━━ Phase 1 ━━━━━━
async function phase1_collectGoogleData(cityName, apiKey, locationStr, regionCode, locationBias) {
  console.log(`\n━━━━━━ PHASE 1: Google Text Search ━━━━━━`);
  const categories = ['restaurant','heritage','hotspot','healing','adventure','shopping'];
  const results = {};
  for (const cat of categories) {
    console.log(`\n📂 [${cat}]`);
    const queries = buildQueries(cat, locationStr);
    const placesByid = new Map();
    for (const q of queries) {
      try {
        console.log(`  📡 "${q.slice(0, 60)}..." (${textCalls + 1})`);
        const found = await textSearch(q, apiKey, regionCode, locationBias);
        for (const p of found) if (!placesByid.has(p.id)) placesByid.set(p.id, p);
      } catch (e) {
        console.error(`  ❌ ${e.message.slice(0, 100)}`);
        if (e.message.includes('DAILY_LIMIT')) throw e;
      }
      await new Promise((r) => setTimeout(r, 10000));
    }
    const sorted = Array.from(placesByid.values())
      .filter((p) => (p.userRatingCount || 0) >= 100 && p.photos?.length > 0)
      .sort((a, b) => {
        if ((b.userRatingCount || 0) !== (a.userRatingCount || 0))
          return (b.userRatingCount || 0) - (a.userRatingCount || 0);
        return (b.photos?.length || 0) - (a.photos?.length || 0);
      })
      .slice(0, 30);
    results[cat] = sorted;
    console.log(`  ✅ ${cat}: ${placesByid.size} 후보 → ${sorted.length} 정렬`);
  }
  return results;
}

// ━━━━━━ Phase 2 ━━━━━━
function phase2_validate(googleData) {
  console.log(`\n━━━━━━ PHASE 2: 검증 ━━━━━━`);
  for (const [cat, rows] of Object.entries(googleData)) {
    console.log(`  ${cat}: ${rows.length} rows`);
    if (rows.length === 0) throw new Error(`🚨 ${cat} 0 rows = 진행 중단`);
  }
  console.log(`  ✅ 검증 통과`);
}

// ━━━━━━ Phase 3-5: DB INSERT ━━━━━━
async function phase3_5_dbInsert(db, cityId, googleData) {
  console.log(`\n━━━━━━ PHASE 3-5: DB 트랜잭션 ━━━━━━`);
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
        const lat = p.location?.latitude;
        const lng = p.location?.longitude;
        if (lat == null || lng == null) continue;
        await db.query(
          `INSERT INTO place_seed_raw (city_id, name_en, latitude, longitude, seed_category, rank, image_url, collection_phase)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, 'bts2026')`,
          [cityId, p.displayName?.text || '', lat, lng, cat, i + 1]
        );
        inserted++;
      }
      console.log(`  ${cat}: DELETE ${del.rowCount} → INSERT ${inserted}`);
      if (inserted === 0) throw new Error(`🚨 ${cat} INSERT 0 = ROLLBACK`);
    }
    await db.query('COMMIT');
    console.log(`  ✅ COMMIT`);
  } catch (e) {
    await db.query('ROLLBACK');
    throw new Error(`Phase 3-5 ROLLBACK: ${e.message}`);
  }
}

// ━━━━━━ Phase 6: Wikipedia ━━━━━━
async function phase6_wikipedia(db, cityId, cityName, googleData) {
  console.log(`\n━━━━━━ PHASE 6: Wikipedia ━━━━━━`);
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
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`  ${cat}: Wiki ${catHit}/${rows.length}`);
  }
  return { hit, total };
}

// ━━━━━━ Phase 7: Photos (식당 20 + 다른 10) ━━━━━━
async function phase7_photos(db, cityId, googleData, apiKey) {
  console.log(`\n━━━━━━ PHASE 7: Photos (식당 20 + 다른 10) ━━━━━━`);

  // 식당 = top 20 만 (rank 1-20)
  console.log(`\n  🍽 RESTAURANT (rank 1-20 만)`);
  const restRows = googleData.restaurant || [];
  for (let i = 0; i < Math.min(restRows.length, 20); i++) {
    if (restaurantPhotoCalls >= RESTAURANT_PHOTOS) break;
    const existing = await db.query(
      `SELECT image_url FROM place_seed_raw WHERE city_id = $1 AND seed_category = 'restaurant' AND rank = $2 AND collection_phase = 'bts2026'`,
      [cityId, i + 1]
    );
    if (existing.rows[0]?.image_url) continue;
    const photoName = restRows[i].photos?.[0]?.name;
    if (!photoName) continue;
    try {
      const url = await getPhotoUrl(photoName, apiKey, true);
      if (url) {
        await db.query(
          `UPDATE place_seed_raw SET image_url = $1, updated_at = NOW()
           WHERE city_id = $2 AND seed_category = 'restaurant' AND rank = $3 AND collection_phase = 'bts2026'`,
          [url, cityId, i + 1]
        );
        console.log(`    ✓ rank ${i + 1}: ${restRows[i].displayName?.text?.slice(0, 30)}`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error(`    ⚠️ rank ${i + 1}: ${e.message.slice(0, 60)}`);
      if (e.message.includes('LIMIT')) break;
    }
  }
  console.log(`  ✅ Restaurant Photos: ${restaurantPhotoCalls}/${RESTAURANT_PHOTOS}`);

  // 다른 5 카테고리 = 잔여 10 (priority: heritage > hotspot > shopping > healing > adventure)
  console.log(`\n  🏛 OTHER 5 CATEGORIES (잔여 10)`);
  const PRIORITY = ['heritage', 'hotspot', 'shopping', 'healing', 'adventure'];
  for (const cat of PRIORITY) {
    if (otherPhotoCalls >= OTHER_PHOTOS) break;
    const rows = googleData[cat] || [];
    for (let i = 0; i < rows.length; i++) {
      if (otherPhotoCalls >= OTHER_PHOTOS) break;
      const existing = await db.query(
        `SELECT image_url FROM place_seed_raw WHERE city_id = $1 AND seed_category = $2 AND rank = $3 AND collection_phase = 'bts2026'`,
        [cityId, cat, i + 1]
      );
      if (existing.rows[0]?.image_url) continue;
      const photoName = rows[i].photos?.[0]?.name;
      if (!photoName) continue;
      try {
        const url = await getPhotoUrl(photoName, apiKey, false);
        if (url) {
          await db.query(
            `UPDATE place_seed_raw SET image_url = $1, updated_at = NOW()
             WHERE city_id = $2 AND seed_category = $3 AND rank = $4 AND collection_phase = 'bts2026'`,
            [url, cityId, cat, i + 1]
          );
          console.log(`    ✓ ${cat} rank ${i + 1}: ${rows[i].displayName?.text?.slice(0, 30)}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        if (e.message.includes('LIMIT')) break;
      }
    }
  }
  console.log(`  ✅ Other Photos: ${otherPhotoCalls}/${OTHER_PHOTOS}`);
}

// ━━━━━━ 메인 ━━━━━━
console.log(`\n🚀 [BTS Daily Cron] ${new Date().toISOString()}`);
console.log(`   모드: ${DRY_RUN ? 'DRY-RUN' : 'REAL'}`);

const db = new pg.Client({ connectionString: SUPA_URL });
await db.connect();

try {
  // 도시 선택
  let city;
  if (MANUAL_CITY) {
    const r = await db.query('SELECT id, name_en, country_code, latitude, longitude FROM cities WHERE name_en = $1', [MANUAL_CITY]);
    if (!r.rows.length) throw new Error(`도시 "${MANUAL_CITY}" 없음`);
    city = r.rows[0];
  } else {
    city = await selectNextCity(db);
    if (!city) {
      console.log(`✅ 모든 도시 처리 완료 — 종료`);
      process.exit(0);
    }
  }

  const apiKey = await getApiKey(db);
  const locationStr = buildLocationStr(city.name_en, city.country_code);
  const locationBias = (city.latitude && city.longitude)
    ? { circle: { center: { latitude: city.latitude, longitude: city.longitude }, radius: 100000 } }
    : null;

  console.log(`✅ 선택: ${city.name_en} (id=${city.id}) | "${locationStr}" | bias 100km`);
  console.log(`✅ API key: ${apiKey.slice(0, 8)}...`);

  if (DRY_RUN) {
    console.log(`\n🔄 DRY-RUN 종료`);
    process.exit(0);
  }

  // Phase 1-7
  const googleData = await phase1_collectGoogleData(city.name_en, apiKey, locationStr, city.country_code, locationBias);
  phase2_validate(googleData);
  await phase3_5_dbInsert(db, city.id, googleData);
  const wiki = await phase6_wikipedia(db, city.id, city.name_en, googleData);
  await phase7_photos(db, city.id, googleData, apiKey);

  console.log(`\n=== 결과 (${city.name_en}) ===`);
  console.log(`Text Search: ${textCalls}/${TEXT_DAILY_LIMIT}`);
  console.log(`Place Photos: ${photoCalls}/${PHOTOS_DAILY_LIMIT} (식당 ${restaurantPhotoCalls}/${RESTAURANT_PHOTOS}, 기타 ${otherPhotoCalls}/${OTHER_PHOTOS})`);
  console.log(`Wikipedia: ${wikiCalls}, 매칭 ${wiki.hit}/${wiki.total}`);
} catch (e) {
  console.error(`\n❌ 진행 중단: ${e.message}`);
  process.exit(1);
} finally {
  await db.end();
}

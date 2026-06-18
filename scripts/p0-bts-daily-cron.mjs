// ⚠️ 수정금지(승인필요) — BTS 일일 cron v3 (사용자 2026-04-27 명시 워크플로우)
//
// === 사용자 명시 워크플로우 (그대로) ===
//   1. 도시명 인자 필수 (자동 선택 X) — 예: --city=El_Paso
//   2. DB 에서 6 vibe 카테고리 × 상위 5 = 30 곳 SELECT
//   3. restaurant × 상위 10 = 10 곳 SELECT
//   4. 공연장 (bts_venue) = skip (Wikipedia URL 그대로)
//   5. 각 row:
//      a. place_id 없음 → searchText (이름 + 도시 + 주 + 국가) → place_id + photoName
//      b. place_id 있음 → searchText skip (캐싱 활용)
//      c. Photo Media → JPEG binary
//      d. Supabase Storage 업로드 → 우리 CDN URL
//      e. UPDATE image_url + google_place_id + image_attribution + image_updated_at
//
// === 일일 cap (이전 v2 그대로) ===
//   - SEARCH 30 + PHOTO 30 = 첫 회 = 도시당 약 3 일 분할 (40 row × 2 호출 ÷ 30)
//   - place_id 캐싱 후 = Photo 만 = 1 일 (이후 갱신)
//
// === 안전장치 5 개 (이전 v2 그대로) ===
//   1. ALLOWED_FIELDS + ATMOSPHERE 33 차단
//   2. searchNearby 호출 X
//   3. SEARCH/PHOTOS DAILY_LIMIT 30 이중 cap
//   4. 호출 간격 10 초 (search), 1.5 초 (photo)
//   5. 429 retry 60 초 1 회만
//
// === Secret 요구사항 ===
//   - SUPA_URL (env)
//   - GOOGLE_MAPS_API_KEY (api_keys 자동 로드)
//   - SUPABASE_ANON_KEY (api_keys 자동 로드, 2026-04-27: bucket place-images RLS 정책 우회)
//
// === 실행 ===
//   node scripts/p0-bts-daily-cron.mjs --city=El_Paso              # 사용자 명시 도시
//   node scripts/p0-bts-daily-cron.mjs --city=El_Paso --dry-run    # 검증
//   node scripts/p0-bts-daily-cron.mjs --city=El_Paso --category=shopping  # 특정 카테고리만

import pg from 'pg';

// ━━━━━━ Config ━━━━━━
const SUPA_URL = process.env.SUPA_URL;
if (!SUPA_URL) {
  console.error('❌ SUPA_URL 환경변수 미설정.');
  process.exit(1);
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const CITY_ARG = args.city ? args.city.replace(/_/g, ' ') : null;
const CATEGORY_ARG = args.category || null;
const DRY_RUN = args['dry-run'] === true;

if (!CITY_ARG) {
  console.error('❌ --city=<도시명> 인자 필수 (예: --city=El_Paso)');
  process.exit(1);
}

// ━━━━━━ 안전장치 #1 ━━━━━━
const ALLOWED_FIELDS = new Set([
  'places.id', 'places.displayName', 'places.location', 'places.formattedAddress',
  'places.photos', 'places.rating', 'places.userRatingCount',
]);
const ATMOSPHERE_FIELDS = new Set([
  'allowsDogs', 'curbsidePickup', 'delivery', 'dineIn', 'editorialSummary', 'evChargeAmenitySummary',
  'evChargeOptions', 'fuelOptions', 'generativeSummary', 'goodForChildren', 'goodForGroups',
  'goodForWatchingSports', 'liveMusic', 'menuForChildren', 'neighborhoodSummary', 'parkingOptions',
  'paymentOptions', 'outdoorSeating', 'reservable', 'restroom', 'reviews', 'reviewSummary',
  'routingSummaries', 'servesBeer', 'servesBreakfast', 'servesBrunch', 'servesCocktails',
  'servesCoffee', 'servesDessert', 'servesDinner', 'servesLunch', 'servesVegetarianFood',
  'servesWine', 'takeout',
]);
const FIELD_MASK = 'places.id,places.displayName,places.location,places.photos,places.userRatingCount,places.googleMapsUri';

function validateFieldMask(mask) {
  for (const f of mask.split(',').map((x) => x.trim())) {
    const bare = f.replace(/^places\./, '');
    if (ATMOSPHERE_FIELDS.has(bare)) throw new Error(`🚨 BLOCKED Atmosphere: ${f}`);
    if (!ALLOWED_FIELDS.has(f)) throw new Error(`🚨 NOT WHITELISTED: ${f}`);
  }
}
validateFieldMask(FIELD_MASK);

// ━━━━━━ 일일 한도 ━━━━━━
// ⚠️ 수정금지(승인필요) — 2026-04-28 사용자 승인: 30 → 40 상향
// 사유: Google quota 50/50 (대시보드 상향) + 도시당 40 = vibe 5×6 + restaurant 10 = 1 cron 1 일 처리
// 효과: 1 도시 = 1 일 자동 (이전 = 30 cap = 2 runs/도시 = 1.3 일/도시)
const SEARCH_DAILY_LIMIT = 40;
const PHOTOS_DAILY_LIMIT = 40;
let searchCalls = 0, photoCalls = 0;

// ━━━━━━ 사용자 SSOT 카테고리 spec ━━━━━━
//   vibe 6 = 카테고리당 상위 5
//   restaurant = 상위 10
//   bts_venue = skip (Wikipedia)
const VIBE_CATEGORIES = ['attraction', 'healing', 'adventure', 'hotspot', 'heritage', 'shopping'];
const RESTAURANT_CATEGORY = 'restaurant';
const VIBE_TOP_N = 5;
const RESTAURANT_TOP_N = 10;

// ━━━━━━ 도시 location string (메모리 project_bts_data_insights.md) ━━━━━━
const US_STATES = {
  'Tampa': 'Florida', 'El Paso': 'Texas', 'Stanford': 'California', 'Las Vegas': 'Nevada',
  'East Rutherford': 'New Jersey', 'Foxborough': 'Massachusetts', 'Baltimore': 'Maryland',
  'Arlington': 'Texas', 'Chicago': 'Illinois', 'Los Angeles': 'California',
};
const COUNTRY_EN = {
  US: 'United States', MX: 'Mexico', KR: 'South Korea', ES: 'Spain', BE: 'Belgium',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', CA: 'Canada', CO: 'Colombia',
  PE: 'Peru', CL: 'Chile', AR: 'Argentina', BR: 'Brazil', TW: 'Taiwan', TH: 'Thailand',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', AU: 'Australia', HK: 'Hong Kong', PH: 'Philippines',
};
function buildLocationStr(city, cc) {
  if (cc === 'US' && US_STATES[city]) return `${city}, ${US_STATES[city]}, United States`;
  return COUNTRY_EN[cc] ? `${city}, ${COUNTRY_EN[cc]}` : city;
}

// ━━━━━━ Google searchText (place_id + photoName) ━━━━━━
async function searchTextOnce(textQuery, apiKey, locationBias) {
  validateFieldMask(FIELD_MASK);
  // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = 한국어 displayName 강제 안 함(키 미삽입 = TS 현지 기본)
  const body = { textQuery, pageSize: 1 };
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

async function findPlace(textQuery, apiKey, locationBias) {
  if (searchCalls >= SEARCH_DAILY_LIMIT) {
    throw new Error(`🚨 SEARCH_DAILY_LIMIT ${SEARCH_DAILY_LIMIT} 초과`);
  }
  searchCalls++;
  let res = await searchTextOnce(textQuery, apiKey, locationBias);
  if (res.status === 429) {
    console.log(`  ⏸️  search 429 → 60초 대기...`);
    await new Promise((r) => setTimeout(r, 60000));
    res = await searchTextOnce(textQuery, apiKey, locationBias);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`searchText 실패 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.places?.[0]) return null;
  const p = data.places[0];
  return {
    placeId: p.id,
    photoName: p.photos?.[0]?.name || null,
    location: p.location || null,
  };
}

// ━━━━━━ Photo Media (binary) ━━━━━━
async function downloadPhotoBinary(photoName, apiKey) {
  if (photoCalls >= PHOTOS_DAILY_LIMIT) {
    throw new Error(`🚨 PHOTOS_DAILY_LIMIT ${PHOTOS_DAILY_LIMIT} 초과`);
  }
  photoCalls++;
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${apiKey}`;
  let res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 429) {
    console.log(`  ⏸️  photo 429 → 60초 대기...`);
    await new Promise((r) => setTimeout(r, 60000));
    res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Photo 실패 ${res.status}: ${t.slice(0, 100)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

// ━━━━━━ Supabase Storage 업로드 ━━━━━━
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
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Storage 업로드 실패 ${res.status}: ${t.slice(0, 200)}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/place-images/${fileName}`;
}

// ━━━━━━ DB ━━━━━━
async function getApiKey(db, keyName) {
  const r = await db.query(
    "SELECT key_value FROM api_keys WHERE key_name = $1 AND is_active = true",
    [keyName]
  );
  if (!r.rows.length) throw new Error(`🚨 ${keyName} 없음 (api_keys 테이블에 추가 필요)`);
  return r.rows[0].key_value;
}

// ━━━━━━ 카테고리 상위 N row SELECT (사용자 SSOT) ━━━━━━
async function selectTopNByCategory(db, cityId, category, topN) {
  const r = await db.query(`
    SELECT id, name_en, name_ko, seed_category, google_place_id, rank
    FROM place_seed_raw
    WHERE city_id = $1
      AND collection_phase = 'bts2026'
      AND seed_category = $2
      AND name_en IS NOT NULL AND TRIM(name_en) <> ''
    ORDER BY rank NULLS LAST, id
    LIMIT $3
  `, [cityId, category, topN]);
  return r.rows;
}

// ━━━━━━ 카테고리 키워드 (사용자 SSOT 본질 정정 2026-04-29) ━━━━━━
// 이전: textQuery = "El Cardenal, Mexico City, Mexico" = 모호 매칭 → photoName 못 받음
// 정정: textQuery = "El Cardenal restaurant 19.4337,-99.1353 Mexico City, Mexico" = 정확
const CATEGORY_KEYWORDS = {
  restaurant: 'restaurant',
  shopping: 'shopping mall',
  attraction: 'tourist attraction landmark',
  healing: 'park spa wellness',
  adventure: 'adventure activities outdoor',
  hotspot: 'popular tourist spot, rooftop and terraces',
  heritage: 'historical site heritage',
};

// ━━━━━━ row 1 개 처리 ━━━━━━
async function processRow(db, row, city, googleKey, supabaseUrl, supabaseKey) {
  const locStr = buildLocationStr(city.name_en, city.country_code);
  // ⚠️ 수정금지(승인필요) — 2026-04-29 사용자 SSOT 본질 정정: 좌표 + 카테고리 키워드 추가
  // 이전 결함: name + city + country = 모호 매칭 (예: "El Cardenal" 동명 다른 가게)
  // 정정: name + categoryKw + 좌표 6자리 + city + country = 정확 매칭 보장
  const categoryKw = CATEGORY_KEYWORDS[row.seed_category] || '';
  const coordStr = (row.latitude && row.longitude) ? `${row.latitude},${row.longitude}` : '';
  const textQuery = [row.name_en, categoryKw, coordStr, locStr]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  console.log(`\n  📍 #${row.id} [${row.seed_category}] ${row.name_en}`);

  let placeId = row.google_place_id;
  let photoName = null;
  let photoLocation = null;

  // searchText (place_id 캐싱 시에도 photoName 받기 위해 1 회 호출)
  if (DRY_RUN) {
    console.log(`     [DRY] searchText("${textQuery.slice(0, 50)}...")`);
    placeId = placeId || 'DRY_PLACE_ID';
    photoName = 'DRY_PHOTO_NAME';
  } else {
    const locBias = city.latitude && city.longitude ? {
      circle: {
        center: { latitude: city.latitude, longitude: city.longitude },
        radius: 50000,
      }
    } : null;
    const found = await findPlace(textQuery, googleKey, locBias);
    if (!found) {
      console.log(`     ✗ searchText 결과 없음 → skip`);
      return { skipped: true };
    }
    placeId = found.placeId;
    photoName = found.photoName;
    photoLocation = found.location;
    console.log(`     ✓ searchText → placeId=${placeId.slice(0, 20)}... photo=${photoName ? '1' : '0'}`);
    await new Promise((r) => setTimeout(r, 10000));
  }

  if (!photoName) {
    console.log(`     ✗ photoName 없음 → skip`);
    return { skipped: true };
  }

  // Photo Media → binary
  let buffer;
  if (DRY_RUN) {
    console.log(`     [DRY] Photo Media`);
    buffer = Buffer.from('DRY');
  } else {
    buffer = await downloadPhotoBinary(photoName, googleKey);
    console.log(`     ✓ binary ${(buffer.length / 1024).toFixed(0)} KB`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Storage 업로드
  const fileName = `${city.id}/${row.seed_category}/${row.id}.jpg`;
  let storageUrl;
  if (DRY_RUN) {
    storageUrl = `[DRY] ${fileName}`;
  } else {
    storageUrl = await uploadToStorage(supabaseUrl, supabaseKey, fileName, buffer);
    console.log(`     ✓ Storage → ${storageUrl}`);
  }

  // DB UPDATE (DELETE/INSERT X)
  const attribution = `Photo via Google Places (${placeId})`;
  if (DRY_RUN) {
    console.log(`     [DRY] UPDATE place_seed_raw`);
  } else {
    // ⚠️ 수정금지(승인필요) — 2026-04-27 사용자 원칙 B: Google = 최종 좌표 SSOT
    // COALESCE($google, 기존) = Google 응답 있으면 무조건 덮어쓰기 (서브에이전트 4자리 → Google 6자리 자동 업그레이드)
    // Google 미응답 시만 기존 보존 (T2/T3 fallback)
    await db.query(`
      UPDATE place_seed_raw
      SET image_url = $1,
          google_place_id = COALESCE(google_place_id, $2),
          image_attribution = $3,
          image_updated_at = NOW(),
          latitude = COALESCE($4, latitude),
          longitude = COALESCE($5, longitude)
      WHERE id = $6
    `, [
      storageUrl, placeId, attribution,
      photoLocation?.latitude || null,
      photoLocation?.longitude || null,
      row.id,
    ]);
    console.log(`     ✓ DB UPDATE`);
  }

  return { processed: true, storageUrl, placeId };
}

// ━━━━━━ Main ━━━━━━
(async () => {
  console.log(`🚀 BTS cron v3 ${DRY_RUN ? '(DRY-RUN)' : ''}`);
  console.log(`   도시: ${CITY_ARG}${CATEGORY_ARG ? ` / 카테고리: ${CATEGORY_ARG}` : ' / 모든 카테고리'}\n`);

  const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    // 1) 도시 → API 키 (⚠️ 2026-06-18 = 도시 먼저 = 출입증 도시id 필요)
    const cr = await db.query(
      'SELECT id, name_en, country_code, latitude, longitude FROM cities WHERE LOWER(name_en) = LOWER($1) LIMIT 1',
      [CITY_ARG]
    );
    if (!cr.rows.length) throw new Error(`도시 없음: ${CITY_ARG}`);
    const city = cr.rows[0];
    console.log(`   ✓ 도시 = ${city.name_en} (id=${city.id}, ${city.country_code})`);

    // ⚠️ 2026-06-18 사장님 SSOT = GOOGLE_MAPS 키 = 출입증 관문 issue_api_key() 경유 (= 직독 폐기). BTS = 발굴 = 도시 있음 + 행 없음(false).
    // = SUPABASE_ANON_KEY / SUPABASE_URL 은 Storage 인증 = 외부호출 키 아님 = getApiKey 직독 유지(건드리지 않음).
    const today = new Date().toISOString().slice(0, 10);
    const googleKey = (await db.query(`SELECT public.issue_api_key('GOOGLE_MAPS_API_KEY', $1, $2, false) AS k`, [city.id, today])).rows[0]?.k;
    if (!googleKey) throw new Error('GOOGLE_MAPS_API_KEY 미발급 = 출입증 검문 미달 또는 api_keys DB 확인');
    let supabaseKey, supabaseUrl;
    if (!DRY_RUN) {
      // ⚠️ 수정금지(승인필요) — 2026-04-27 사용자 결정: ANON key + RLS 정책 우회
      // service_role key 없으므로 anon key (publishable) 사용. bucket place-images RLS 정책 = anon INSERT 허용.
      supabaseKey = await getApiKey(db, 'SUPABASE_ANON_KEY');
      // ⚠️ 수정금지(승인필요) — 2026-04-27 사용자 승인 SUPABASE_URL 다중 fallback
      // 우선순위: env > api_keys > 직접 (db.X.supabase.co) > pooler (postgres.X@...)
      if (process.env.SUPABASE_URL) {
        supabaseUrl = process.env.SUPABASE_URL;
      } else {
        try {
          supabaseUrl = await getApiKey(db, 'SUPABASE_URL');
        } catch {
          // direct: postgresql://postgres:pwd@db.PROJECT.supabase.co:5432/postgres
          let m = SUPA_URL.match(/db\.([^.]+)\.supabase\.co/);
          // pooler: postgresql://postgres.PROJECT:pwd@aws-0-region.pooler.supabase.com:6543/postgres
          if (!m) m = SUPA_URL.match(/postgres\.([a-z0-9]+):/);
          if (!m) throw new Error('SUPABASE_URL 추정 실패 (env / api_keys / db / pooler 모두 실패)');
          supabaseUrl = `https://${m[1]}.supabase.co`;
        }
      }
    }

    // 2) 카테고리별 상위 N row 수집 (사용자 SSOT)
    const tasks = [];

    // CATEGORY_ARG 명시 = 그 카테고리만
    const categoriesToProcess = CATEGORY_ARG
      ? [CATEGORY_ARG]
      : [...VIBE_CATEGORIES, RESTAURANT_CATEGORY];

    for (const cat of categoriesToProcess) {
      const topN = cat === RESTAURANT_CATEGORY ? RESTAURANT_TOP_N : VIBE_TOP_N;
      const rows = await selectTopNByCategory(db, city.id, cat, topN);
      tasks.push(...rows);
      console.log(`   ✓ ${cat}: ${rows.length}/${topN}`);
    }

    if (tasks.length === 0) {
      console.log('\n✗ 처리할 row 없음 (카테고리 시드 0)');
      return;
    }
    console.log(`\n📊 처리 대상: ${tasks.length} row`);

    // 3) 각 row 처리 (cap 안)
    let processed = 0, skipped = 0, errors = 0;
    for (const row of tasks) {
      try {
        const r = await processRow(db, row, city, googleKey, supabaseUrl, supabaseKey);
        if (r.skipped) skipped++;
        else if (r.processed) processed++;
      } catch (e) {
        errors++;
        console.error(`     ❌ ${e.message.slice(0, 200)}`);
        if (e.message.includes('DAILY_LIMIT')) {
          console.error('🚨 일일 한도 도달 — 종료 (남은 row 는 다음 날)');
          break;
        }
      }
    }

    console.log(`\n📊 결과: 처리 ${processed} / skip ${skipped} / 오류 ${errors}`);
    console.log(`📞 호출: search ${searchCalls} / photo ${photoCalls}`);
  } finally {
    await db.end();
  }

  console.log(`\n✅ cron 완료 ${DRY_RUN ? '(DRY-RUN)' : ''}`);
})().catch((e) => {
  console.error('❌ FATAL:', e.message);
  process.exit(1);
});

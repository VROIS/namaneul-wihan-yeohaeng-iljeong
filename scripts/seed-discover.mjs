// ⚠️ 수정금지(승인필요) — 2026-04-30 사용자 SSOT 헌법 단일 구현 — CLAUDE.md 제3조
// 기준 문서: docs/로우데이타 최적화 과정 2026.04.30.md (헌법 §1~§11)
//
// 후임 AI 절대 변경 금지 (헌법 §10.7.2):
//   - textQuery 7 카테고리 (§2.2), TYPE_TO_CATEGORIES (§3.1)
//   - 100km 필터 (§2.6), PhotoMedia 간격 6,000ms (§2.7)
//   - 검증 기준 multi-tag ≥7 + 이미지 ≥7 (§8.1)
//   - ON CONFLICT 표현 (§2.8), bts_* 메타 DELETE 금지
//
// 후임 AI 1 명령 (헌법 §10.7.1):
//   node scripts/seed-discover.mjs --city-name="<도시>" --country="<국가>" [--state="<주>"]
//   = 옵션 (--dry-run, --reuse-raw) 사용자 명시 후만
//
// 사용법 (사용자 표준):
//   node scripts/seed-discover.mjs --city-name="Mexico City" --country="Mexico"
//   node scripts/seed-discover.mjs --city-name="Stanford" --state="California" --country="United States"

import fs from 'fs';
import path from 'path';
import pg from 'pg';

// ─── CLI 인자 파싱 ───
const args = process.argv.slice(2).reduce((acc, arg) => {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});

let CITY_ID = parseInt(args['city-id'], 10) || null;
const CITY_NAME = args['city-name'];
const STATE = args['state'] || '';
const COUNTRY = args['country'];
const DRY_RUN = process.argv.includes('--dry-run');
const REUSE_RAW = process.argv.includes('--reuse-raw');  // 헌법 §2.8.1: raw + Storage 디스크 재사용 (ROLLBACK 후 재시도용)

if (!CITY_NAME || !COUNTRY) {
  console.error('❌ Required: --city-name, --country');
  console.error('   Optional: --city-id (생략 시 cities 테이블에서 자동 조회)');
  console.error('   Optional: --state (미국 도시 동명이 모호 회피)');
  console.error('   Optional: --dry-run (Stage 1+2 만, Stage 3~8 skip + 선임 결과 비교 출력)');
  process.exit(1);
}

// 미국 도시는 state 강제 (사용자 SSOT [project_bts_data_insights])
if (COUNTRY === 'United States' && !STATE) {
  console.error('❌ 미국 도시는 --state 필수 (Stanford CA vs CT 등 모호 회피)');
  process.exit(1);
}

// ─── .env 직접 파싱 (dotenv 의존 X, BOM/CRLF 처리, 사용자 SSOT: MCP 안 쓰고 자동화) ───
if (fs.existsSync('.env')) {
  const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      // 양쪽 따옴표 제거 (DATABASE_URL="..." 또는 'postgres://...' 등 패턴)
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  }
}

// SUPA_URL = DB connection string (.env 에서 fallback 체인)
let SUPA_URL = process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!SUPA_URL) {
  console.error('❌ .env 에 DATABASE_URL / SUPABASE_DATABASE_URL / SUPA_URL 중 하나 필요');
  process.exit(1);
}

// Direct (db.{ref}.supabase.co:5432) → Pooler 자동 변환
// 사유: Supabase 2024+ Direct = IPv6 only, 로컬 Windows = IPv4 = DNS ENOTFOUND
// Pooler (aws-0-{region}.pooler.supabase.com:6543) = IPv4 지원
const directMatch = SUPA_URL.match(/^(postgresql:\/\/)postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co:5432\/postgres/);
if (directMatch) {
  const region = process.env.SUPABASE_REGION || 'eu-west-3';  // 이 프로젝트 NUBI = eu-west-3
  const [, scheme, pwd, ref] = directMatch;
  SUPA_URL = `${scheme}postgres.${ref}:${pwd}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
  console.log(`  → Direct host IPv6-only 감지, Pooler 자동 변환 (region=${region})`);
}

// 나머지 3 키 = let 으로 선언 (api_keys 테이블 fallback 후 채워짐)
let GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
let SUPABASE_PUBLIC = process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL;
let SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;

// DB 접속 후 api_keys 테이블에서 누락분 fetch (사용자 SSOT: "전부 db apikey 에 있음")
async function ensureApiKeys(db) {
  if (GOOGLE_KEY && SUPABASE_ANON && SUPABASE_PUBLIC) return;
  const { rows } = await db.query(
    `SELECT key_name, key_value FROM public.api_keys WHERE is_active = true`
  );
  const map = Object.fromEntries(rows.map(r => [r.key_name, r.key_value]));
  if (!GOOGLE_KEY) GOOGLE_KEY = map.GOOGLE_PLACES_API_KEY || map.GOOGLE_MAPS_API_KEY;
  if (!SUPABASE_ANON) SUPABASE_ANON = map.SUPABASE_ANON_KEY;
  // SUPABASE_PUBLIC = api_keys 에 없음 → SUPA_URL 의 project ref 로 도출
  if (!SUPABASE_PUBLIC) {
    const m = SUPA_URL.match(/(?:db\.)?([a-z0-9]+)\.supabase\.co/);
    if (m) SUPABASE_PUBLIC = `https://${m[1]}.supabase.co`;
  }
  if (!GOOGLE_KEY || !SUPABASE_ANON || !SUPABASE_PUBLIC) {
    throw new Error(`env 누락: GOOGLE_KEY=${!!GOOGLE_KEY}, SUPABASE_ANON=${!!SUPABASE_ANON}, SUPABASE_PUBLIC=${!!SUPABASE_PUBLIC}`);
  }
}

// ─── 헌법 §2.2 7 카테고리 textQuery (Google type 자연어 묶음 — 사용자 정정 2026-04-30) ───
// 6 카테고리 = type 영문 자연어 묶음 (언더스코어 → 스페이스)
// hotspot 1 카테고리만 예외 = 사용자 검증 단일 SSOT (멕시코시티 8/8, type 묶음 X)
const LOC_STR = [CITY_NAME, STATE, COUNTRY].filter(Boolean).join(', ');
const QUERIES = {
  heritage:   `museum art museum science museum history museum historical landmark historical place castle monument palace fortress church cathedral mosque temple synagogue archaeological site cultural center in ${LOC_STR}`,
  hotspot:    `viewpoints photo spots in ${LOC_STR}`,
  attraction: `tourist attraction amusement park zoo aquarium theme park planetarium in ${LOC_STR}`,
  adventure:  `amusement park water park theme park hiking area climbing gym gym sports complex ski resort nature reserve in ${LOC_STR}`,
  healing:    `park spa garden botanical garden beach wellness center nature preserve in ${LOC_STR}`,
  shopping:   `shopping mall department store store supermarket market in ${LOC_STR}`,
  restaurant: `restaurant cafe bakery bar food meal takeaway meal delivery in ${LOC_STR}`,
};
const CATEGORIES = Object.keys(QUERIES);

// ─── 헌법 §3.1 TYPE_TO_CATEGORIES (복수 배열, 사용자 정정 2026-04-30) ───
// 한 type → 복수 카테고리 명시. mutually exclusive 가정 절대 X.
const TYPE_TO_CATEGORIES = {
  // heritage
  museum:               ['heritage'],
  art_museum:           ['heritage'],
  science_museum:       ['heritage'],
  history_museum:       ['heritage'],
  historical_landmark:  ['heritage'],
  historical_place:     ['heritage'],
  castle:               ['heritage'],
  palace:               ['heritage'],
  fortress:             ['heritage'],
  church:               ['heritage'],
  cathedral:            ['heritage'],
  mosque:               ['heritage'],
  temple:               ['heritage'],
  synagogue:            ['heritage'],
  archaeological_site:  ['heritage'],
  cultural_center:      ['heritage'],

  // hotspot
  observation_deck:     ['hotspot'],
  viewpoint:            ['hotspot'],
  scenic_overlook:      ['hotspot'],
  cultural_landmark:    ['hotspot'],
  plaza:                ['hotspot'],

  // heritage ∩ hotspot (멕시코시티 검증)
  monument:             ['heritage', 'hotspot'],

  // attraction
  tourist_attraction:   ['attraction'],
  zoo:                  ['attraction'],
  aquarium:             ['attraction'],
  planetarium:          ['attraction'],

  // attraction ∩ adventure
  amusement_park:       ['attraction', 'adventure'],
  theme_park:           ['attraction', 'adventure'],

  // adventure
  water_park:               ['adventure'],
  hiking_area:              ['adventure'],
  climbing_gym:             ['adventure'],
  gym:                      ['adventure'],
  sports_complex:           ['adventure'],
  ski_resort:               ['adventure'],
  nature_reserve:           ['adventure'],
  adventure_sports_center:  ['adventure'],  // 사용자 정정 2026-04-30 (Bangkok 보강)
  sports_activity_location: ['adventure'],  // 사용자 정정 2026-04-30
  amusement_center:         ['adventure'],  // 사용자 정정 2026-04-30

  // healing
  park:                 ['healing'],
  spa:                  ['healing'],
  garden:               ['healing'],
  botanical_garden:     ['healing'],
  beach:                ['healing'],
  wellness_center:      ['healing'],
  nature_preserve:      ['healing'],

  // shopping
  shopping_mall:        ['shopping'],
  department_store:     ['shopping'],
  store:                ['shopping'],
  supermarket:          ['shopping'],
  market:               ['shopping'],

  // restaurant
  restaurant:           ['restaurant'],
  cafe:                 ['restaurant'],
  bakery:               ['restaurant'],
  bar:                  ['restaurant'],
  food:                 ['restaurant'],
  meal_takeaway:        ['restaurant'],
  meal_delivery:        ['restaurant'],
};

// ─── 헌법 §2.6 haversine 거리 (km), 도심 100km 필터용 ───
function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ─── SQL escape ───
function sqlEsc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return v;
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlArr(a) {
  if (!a || a.length === 0) return 'NULL';
  return 'ARRAY[' + a.map(sqlEsc).join(',') + ']::text[]';
}
function sqlJsonb(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}

// ─── Stage 1: 7 카테고리 textSearch 병렬 ───
async function stage1_textSearch() {
  // 헌법 §2.8.1: --reuse-raw 시 디스크 _seed_raw/{cityId}/{cat}.json 로드 (Google API 호출 X)
  if (REUSE_RAW) {
    const dir = path.join('_seed_raw', String(CITY_ID));
    if (!fs.existsSync(dir)) throw new Error(`--reuse-raw 인데 ${dir} 없음`);
    console.log(`\n[1] textSearch SKIP — raw JSON 디스크 재사용 (${dir})`);
    const results = CATEGORIES.map(cat => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, `${cat}.json`), 'utf-8'));
      return { cat, places: raw.places || [], raw };
    });
    for (const r of results) console.log(`  → ${r.cat}: ${r.places.length} places (디스크)`);
    return results;
  }
  console.log(`\n[1] textSearch 7 카테고리 병렬 (FieldMask=*, pageSize=10)`);
  const results = await Promise.all(CATEGORIES.map(async (cat) => {
    const textQuery = QUERIES[cat];
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': '*',
      },
      body: JSON.stringify({ textQuery, pageSize: 10 }),  // 헌법 §2.2 pageSize=10
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`textSearch ${cat} ${resp.status}: ${t.slice(0, 200)}`);
    }
    const data = await resp.json();
    return { cat, places: data.places || [], raw: data };
  }));
  for (const r of results) console.log(`  → ${r.cat}: ${r.places.length} places`);
  return results;
}

// ─── Stage 2: raw JSON 백업 ───
function stage2_backup(stage1Results) {
  if (REUSE_RAW) { console.log(`\n[2] backup SKIP (--reuse-raw)`); return; }
  console.log(`\n[2] raw JSON 백업 저장`);
  const dir = path.join('_seed_raw', String(CITY_ID));
  fs.mkdirSync(dir, { recursive: true });
  for (const { cat, raw } of stage1Results) {
    fs.writeFileSync(path.join(dir, `${cat}.json`), JSON.stringify(raw, null, 2));
  }
  console.log(`  → ${dir}/ (${stage1Results.length} 파일)`);
}

// ─── Stage 3+4+5: 100km 필터 + top 10 정렬 + types[] multi-tag + dedup ───
function stage345_classify(stage1Results, cityCenter) {
  console.log(`\n[3+4+5] 100km 필터 (헌법 §2.6) → userRatingCount DESC top 10 → types[] multi-tag → dedup`);
  const placeMap = new Map();  // placeId → { p, primary, primaryRank, cats: Set }

  for (const { cat, places } of stage1Results) {
    // 헌법 §2.6: 도심 100km 거리 필터 (silent skip 금지, log 명시)
    const within = [];
    let outside = 0;
    for (const p of places) {
      const lat = p.location?.latitude, lng = p.location?.longitude;
      if (lat == null || lng == null) { outside++; continue; }
      const km = haversineKm(cityCenter.lat, cityCenter.lng, lat, lng);
      if (km <= 100) within.push(p);
      else outside++;
    }
    if (outside > 0) console.log(`  ⚠️  ${cat}: ${outside}/${places.length} 응답 100km 초과 → 제외`);

    const sorted = within
      .sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0))
      .slice(0, 10);

    sorted.forEach((p, idx) => {
      const types = p.types || [];
      const inferredCats = new Set([cat]);  // primary = 검색 카테고리

      // types[] 보고 추가 카테고리 매핑 (헌법 §3.1, 복수 배열 합집합)
      for (const t of types) {
        const cats = TYPE_TO_CATEGORIES[t];
        if (cats) for (const c of cats) inferredCats.add(c);
        // 매핑에 없는 type = silent skip (헌법 §3.1 원칙)
      }

      if (!placeMap.has(p.id)) {
        placeMap.set(p.id, { p, primary: cat, primaryRank: idx + 1, cats: inferredCats });
      } else {
        // 이미 등록 = category_tags 에 추가만
        const ent = placeMap.get(p.id);
        for (const c of inferredCats) ent.cats.add(c);
      }
    });
  }

  const rows = [...placeMap.values()];
  console.log(`  → ${rows.length} unique places (placeId dedup)`);
  console.log(`  → 평균 category_tags 길이: ${(rows.reduce((s, r) => s + r.cats.size, 0) / rows.length).toFixed(2)}`);
  return rows;
}

// ─── Stage 6: PhotoMedia (헌법 §2.7 — 6초 간격 + 60초 init cool down + 429 retry 1회) ───
async function stage6_photoMedia(rows) {
  // 헌법 §2.8.1: --reuse-raw 시 PhotoMedia 호출 X, image_url 직접 구성 (Storage 이미 업로드됨)
  if (REUSE_RAW) {
    console.log(`\n[6] PhotoMedia SKIP — Storage 이미 업로드됨, image_url 직접 구성 (--reuse-raw)`);
    return rows.map(row => {
      const photoName = row.p.photos?.[0]?.name;
      const placeholder = photoName ? Buffer.alloc(1) : null;  // photos[0] 있으면 binary placeholder (Stage 7 에서 URL 만 구성)
      return { row, binary: placeholder };
    });
  }
  // 헌법 §2.7.2 ① 60 초 init cool down (직전 실행 슬라이딩 윈도우 빠짐)
  console.log(`\n[6] PhotoMedia API 호출 (헌법 §2.7: 60s init cool down → 6s 간격 → 429 시 60s retry)`);
  console.log(`  ⏳ 60s init cool down 시작 (직전 실행 quota 윈도우 빠짐 보장)...`);
  await new Promise(r => setTimeout(r, 60000));
  console.log(`  ▶️  PhotoMedia 호출 시작 (per user 분당 10 한도)`);

  const results = [];
  let success = 0, fail = 0, retried = 0;

  async function callOnce(photoName) {
    const r = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${GOOGLE_KEY}`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (r.status === 429) throw new Error('429');
    if (!r.ok) throw new Error(`PhotoMedia ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  for (const row of rows) {
    const photoName = row.p.photos?.[0]?.name;
    if (!photoName) {
      console.log(`  ⏭️  ${row.p.displayName?.text || '?'}: photos[0] 없음 (silent skip 금지, image_url=NULL)`);
      results.push({ row, binary: null });
      fail++;
      continue;
    }
    let buffer = null;
    try {
      buffer = await callOnce(photoName);
      success++;
    } catch (e) {
      // 헌법 §2.7.2 ③ 429 retry 1 회 (60 초 대기)
      if (/429/.test(e.message)) {
        console.log(`  ⏳ ${row.p.displayName?.text}: 429 → 60s 대기 후 1회 재시도`);
        await new Promise(r => setTimeout(r, 60000));
        try {
          buffer = await callOnce(photoName);
          success++; retried++;
        } catch (e2) {
          console.log(`  ⚠️  ${row.p.displayName?.text}: retry 실패 ${e2.message} → image_url=NULL`);
          fail++;
        }
      } else {
        console.log(`  ⚠️  ${row.p.displayName?.text}: ${e.message} → image_url=NULL`);
        fail++;
      }
    }
    results.push({ row, binary: buffer });
    // 헌법 §2.7.2 ② 6,000ms 간격 (분당 10 = per user 한도 부합)
    await new Promise(r => setTimeout(r, 6000));
  }
  console.log(`  → ${success} 성공 (retry ${retried}) / ${fail} 실패`);
  return results;
}

// ─── Stage 7: Supabase Storage 업로드 ───
async function stage7_storage(photoResults) {
  // 헌법 §2.8.1: --reuse-raw 시 업로드 X, URL 만 직접 구성
  if (REUSE_RAW) {
    console.log(`\n[7] Storage SKIP — URL 직접 구성 (--reuse-raw)`);
    let cnt = 0;
    for (const item of photoResults) {
      if (!item.binary) { item.storageUrl = null; continue; }
      const fileName = `${CITY_ID}/${item.row.primary}/${item.row.p.id}.jpg`;
      item.storageUrl = `${SUPABASE_PUBLIC}/storage/v1/object/public/place-images/${fileName}`;
      cnt++;
    }
    console.log(`  → ${cnt} URL 구성 (Storage 호출 0)`);
    return photoResults;
  }
  console.log(`\n[7] Supabase Storage 업로드`);
  let success = 0, fail = 0;

  for (const item of photoResults) {
    if (!item.binary) {
      item.storageUrl = null;
      continue;
    }
    const fileName = `${CITY_ID}/${item.row.primary}/${item.row.p.id}.jpg`;
    try {
      const r = await fetch(`${SUPABASE_PUBLIC}/storage/v1/object/place-images/${fileName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: item.binary,
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`Storage ${r.status}`);
      item.storageUrl = `${SUPABASE_PUBLIC}/storage/v1/object/public/place-images/${fileName}`;
      success++;
    } catch (e) {
      console.log(`  ⚠️  ${item.row.p.displayName?.text}: Storage ${e.message}`);
      item.storageUrl = null;
      fail++;
    }
  }
  console.log(`  → ${success} 업로드 / ${fail} 실패`);
  return photoResults;
}

// ─── Stage 8: 트랜잭션 INSERT (BEGIN → 검증 → COMMIT/ROLLBACK) ───
async function stage8_transaction(photoResults, db) {
  console.log(`\n[8] 트랜잭션 INSERT (BEGIN → 검증 → COMMIT/ROLLBACK)`);
  await db.query('BEGIN');
  try {
    // DELETE 기존 7 카테고리 시드
    await db.query(`
      DELETE FROM place_seed_raw
      WHERE city_id = $1 AND collection_phase = 'bts2026'
        AND seed_category = ANY($2::text[])
    `, [CITY_ID, CATEGORIES]);

    // INSERT 행별
    for (const item of photoResults) {
      const p = item.row.p;
      const photoName = p.photos?.[0]?.name || null;
      const reviewSummary = p.reviewSummary?.text?.text || null;
      const editorial = p.generativeSummary?.overview?.text || p.editorialSummary?.text?.text || null;
      const hours = p.regularOpeningHours?.weekdayDescriptions || null;

      // 헌법 §2.8: ON CONFLICT (city_id, name_norm) DO UPDATE — multi-tag union + 이미지 채움
      // bts_* 메타와 같은 장소 충돌 시 = 기존 row 의 category_tags 에 새 카테고리 추가, image_url 채움
      const sql = `INSERT INTO place_seed_raw (
        city_id, seed_category, collection_phase, rank,
        name_en, latitude, longitude,
        google_place_id, google_review_count, google_rating,
        editorial_summary, nubi_reason, opening_hours,
        photo_urls, evidence_url, image_url,
        category_tags, phase_tags, created_at
      ) VALUES (
        ${CITY_ID}, ${sqlEsc(item.row.primary)}, 'bts2026', ${item.row.primaryRank},
        ${sqlEsc(p.displayName?.text || '')}, ${sqlEsc(p.location?.latitude)}, ${sqlEsc(p.location?.longitude)},
        ${sqlEsc(p.id)}, ${sqlEsc(p.userRatingCount || 0)}, ${sqlEsc(p.rating || null)},
        ${sqlEsc(editorial)}, ${sqlEsc(reviewSummary)}, ${sqlJsonb(hours)},
        ${sqlJsonb(photoName ? [{ name: photoName }] : null)}, ${sqlEsc(p.googleMapsUri || null)}, ${sqlEsc(item.storageUrl)},
        ${sqlArr([...item.row.cats])}, ${sqlArr(['bts2026'])}, NOW()
      )
      ON CONFLICT (city_id, (lower(trim(name_en))))
      WHERE name_en IS NOT NULL AND trim(name_en) <> ''
      DO UPDATE SET
        category_tags = (SELECT ARRAY(SELECT DISTINCT unnest(place_seed_raw.category_tags || EXCLUDED.category_tags))),
        phase_tags    = (SELECT ARRAY(SELECT DISTINCT unnest(place_seed_raw.phase_tags || EXCLUDED.phase_tags))),
        image_url     = COALESCE(EXCLUDED.image_url, place_seed_raw.image_url),
        google_review_count = COALESCE(EXCLUDED.google_review_count, place_seed_raw.google_review_count),
        google_rating       = COALESCE(EXCLUDED.google_rating, place_seed_raw.google_rating),
        editorial_summary   = COALESCE(EXCLUDED.editorial_summary, place_seed_raw.editorial_summary),
        nubi_reason         = COALESCE(EXCLUDED.nubi_reason, place_seed_raw.nubi_reason),
        opening_hours       = COALESCE(EXCLUDED.opening_hours, place_seed_raw.opening_hours),
        photo_urls          = COALESCE(EXCLUDED.photo_urls, place_seed_raw.photo_urls),
        evidence_url        = COALESCE(EXCLUDED.evidence_url, place_seed_raw.evidence_url),
        rank                = LEAST(place_seed_raw.rank, EXCLUDED.rank)
        -- seed_category (primary), name_en, latitude, longitude = 기존 유지 (bts_* 메타 우선)
      `;
      await db.query(sql);
    }

    // 헌법 §8 검증 — multi-tag 기준 카테고리별 ≥ 7 + 이미지 ≥ 7 (사용자 SSOT 정정 2026-04-30)
    // 사용자 2일치 × 하루 5장 = 10장 프론트엔드 노출 기준. 중복 인정 (category_tags 합산).
    const { rows: byCat } = await db.query(`
      SELECT cat,
        COUNT(*) FILTER (WHERE category_tags @> ARRAY[cat]) AS multi_total,
        COUNT(*) FILTER (WHERE category_tags @> ARRAY[cat] AND image_url IS NOT NULL) AS multi_img,
        COUNT(*) FILTER (WHERE seed_category = cat) AS prim_total,
        COUNT(*) FILTER (WHERE seed_category = cat AND image_url IS NOT NULL) AS prim_img
      FROM place_seed_raw
      CROSS JOIN unnest($2::text[]) AS cat
      WHERE city_id = $1 AND collection_phase = 'bts2026'
      GROUP BY cat
      ORDER BY cat
    `, [CITY_ID, CATEGORIES]);

    const { rows: [boundary] } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE seed_category = ANY($2::text[])) AS total,
        COUNT(*) FILTER (WHERE seed_category = ANY($2::text[]) AND (latitude IS NULL OR longitude IS NULL OR name_en IS NULL)) AS null_critical,
        COUNT(*) FILTER (WHERE seed_category = ANY($2::text[]) AND google_review_count IS NULL) AS null_review
      FROM place_seed_raw
      WHERE city_id = $1 AND collection_phase = 'bts2026'
    `, [CITY_ID, CATEGORIES]);

    console.log(`  검증 (헌법 §8.1 multi-tag 기준):`);
    console.log(`    cat        primary(img)   multi-tag(img) ≥7+img≥7?`);
    let allPass = true;
    const failed = [];
    for (const r of byCat) {
      const mt = Number(r.multi_total), mi = Number(r.multi_img);
      const pass = mt >= 7 && mi >= 7;
      if (!pass) { allPass = false; failed.push(`${r.cat}:multi=${mt}/img=${mi}`); }
      console.log(`    ${r.cat.padEnd(11)} ${(r.prim_total+'('+r.prim_img+')').padEnd(13)} ${(mt+'('+mi+')').padEnd(13)} ${pass ? '✅' : '❌'}`);
    }

    const totalAll = Number(boundary.total);
    const nullCrit = Number(boundary.null_critical);
    const nullRev = Number(boundary.null_review);
    console.log(`    boundary: total=${totalAll}, null_critical(좌표/이름)=${nullCrit}, null_review_count=${nullRev}`);

    if (nullCrit > 0) throw new Error(`기준 미달: 좌표·이름 NULL ${nullCrit} 행`);
    if (nullRev > 0) throw new Error(`기준 미달: review_count NULL ${nullRev} 행`);
    if (!allPass) throw new Error(`카테고리별 multi-tag ≥7+이미지≥7 미달: ${failed.join(', ')}`);

    await db.query('COMMIT');
    console.log(`  ✅ COMMIT (${totalAll} 행, 7 카테고리 multi-tag 모두 ≥ 7+이미지≥7)`);
    return { total: totalAll, byCat };
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(`  ❌ ROLLBACK: ${e.message}`);
    throw e;
  }
}

// ─── DRY RUN 비교: 새 textSearch 응답 (100km 필터 후 top 10) vs 선임 DB 결과 ───
async function dryRunCompare(db, stage1Results, cityCenter) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`[비교] 새 응답 (헌법 §2.6 100km 필터 + top 10 userRatingCount DESC) vs 선임 DB`);
  console.log(`${'═'.repeat(70)}`);

  const { rows: existing } = await db.query(
    `SELECT seed_category, rank, name_en, google_place_id,
            google_review_count, (image_url IS NOT NULL) AS has_img
     FROM place_seed_raw
     WHERE city_id = $1 AND collection_phase = 'bts2026'
       AND seed_category = ANY($2::text[])
     ORDER BY seed_category, rank`,
    [CITY_ID, CATEGORIES]
  );
  const existingByCat = {};
  for (const r of existing) (existingByCat[r.seed_category] ??= []).push(r);

  for (const cat of CATEGORIES) {
    const rawPlaces = stage1Results.find(s => s.cat === cat)?.places || [];
    // 헌법 §2.6 100km 필터
    const within = rawPlaces.filter(p => {
      const lat = p.location?.latitude, lng = p.location?.longitude;
      if (lat == null || lng == null) return false;
      return haversineKm(cityCenter.lat, cityCenter.lng, lat, lng) <= 100;
    });
    const newSorted = within
      .sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0))
      .slice(0, 10);
    const oldList = existingByCat[cat] || [];

    const filteredOut = rawPlaces.length - within.length;
    const note = filteredOut > 0 ? ` (${filteredOut} 광역 제외)` : '';
    console.log(`\n── ${cat} (선임 ${oldList.length} 행 vs 새 ${newSorted.length} 행${note}) ──`);
    const maxLen = Math.max(newSorted.length, oldList.length);
    for (let i = 0; i < maxLen; i++) {
      const o = oldList[i];
      const n = newSorted[i];
      const oldStr = o
        ? `[${String(o.rank).padStart(2)}] ${(o.name_en || '').slice(0, 28).padEnd(28)} (rev=${String(o.google_review_count ?? 0).padStart(6)}, img=${o.has_img ? 'Y' : 'N'})`
        : '-'.padEnd(60);
      const newStr = n
        ? `[${String(i + 1).padStart(2)}] ${(n.displayName?.text || '').slice(0, 28).padEnd(28)} (rev=${String(n.userRatingCount ?? 0).padStart(6)})`
        : '-';
      const sameId = o?.google_place_id && n?.id === o.google_place_id ? '✓' : ' ';
      console.log(`  ${sameId} 선임: ${oldStr} | 새: ${newStr}`);
    }
    const oldIds = new Set(oldList.map(r => r.google_place_id).filter(Boolean));
    const newIds = new Set(newSorted.map(p => p.id));
    const overlap = [...oldIds].filter(id => newIds.has(id)).length;
    console.log(`  → 동일 placeId 일치: ${overlap} / max(${oldIds.size}, ${newIds.size})`);
  }
}

// ─── Main ───
async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🌆 ${CITY_NAME} (${LOC_STR})${DRY_RUN ? '  [DRY RUN]' : ''}`);
  console.log(`${'═'.repeat(70)}`);

  const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await ensureApiKeys(db);  // .env 누락분 → api_keys 테이블에서 fetch (사용자 SSOT)

  // city_id 자동 조회 (인자 없으면). country 컬럼이 한국어/영어 혼재 → name_en 단독 매칭
  if (!CITY_ID) {
    const { rows } = await db.query(
      `SELECT id FROM cities WHERE LOWER(name_en) = LOWER($1) LIMIT 1`,
      [CITY_NAME]
    );
    if (!rows.length) {
      await db.end();
      throw new Error(`city not found: ${CITY_NAME}`);
    }
    CITY_ID = rows[0].id;
    console.log(`  → city_id 자동 조회: ${CITY_ID}`);
  }

  // 도심 좌표 SELECT (헌법 §2.6 100km 필터용)
  const { rows: ctr } = await db.query(
    `SELECT latitude, longitude FROM cities WHERE id = $1`, [CITY_ID]
  );
  if (!ctr.length || ctr[0].latitude == null || ctr[0].longitude == null) {
    await db.end();
    throw new Error(`city ${CITY_ID} 좌표 누락 → 100km 필터 X`);
  }
  const CITY_CENTER = { lat: parseFloat(ctr[0].latitude), lng: parseFloat(ctr[0].longitude) };
  console.log(`  → 도심 좌표: (${CITY_CENTER.lat}, ${CITY_CENTER.lng}) — 100km 필터 활성화 (헌법 §2.6)`);

  try {
    const startTime = Date.now();
    const stage1 = await stage1_textSearch();
    stage2_backup(stage1);

    // DRY RUN: Stage 3~8 skip, 비교 출력만
    if (DRY_RUN) {
      await dryRunCompare(db, stage1, CITY_CENTER);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ DRY RUN 완료 (${elapsed}s, DB 변경 0, Storage 호출 0)`);
      return;
    }

    const rows = stage345_classify(stage1, CITY_CENTER);
    const photos = await stage6_photoMedia(rows);
    const uploaded = await stage7_storage(photos);
    const result = await stage8_transaction(uploaded, db);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ ${CITY_NAME} 완료: ${result.total} 행, ${elapsed}s`);
  } finally {
    await db.end();
  }
}

main().catch(e => {
  console.error('\n❌ 전체 실패:', e.message);
  process.exit(1);
});

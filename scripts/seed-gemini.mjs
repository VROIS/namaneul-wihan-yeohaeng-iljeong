// scripts/seed-gemini.mjs
// SEED SSOT 2026-05-12 v3 영구 구현 (헌법 docs/SEED_SSOT_2026-05-02.md §1~§11 + 2026-05-12 갱신)
//
// ⚠️ 수정금지(승인필요) 2026-05-12 v3 = 사용자 SSOT 확정 (= 브뤼셀 시뮬 검증)
// = Korean travelers 컨텍스트 명시 (= 인스타/블로그/유튜브 트렌드 기준)
// = 가짜 위험 필드 5개 제거: place_id, google_review_count, primary_type, types, shortform_en
// = 신규 필드: selection_reason_ko (= 인스타/FOMO) + shortform_ko (= 코믹/위트 Claude 톤)
// = 컬럼 매핑: summary_ko ← selection_reason_ko / editorial_summary ← shortform_ko
// = 6 카테고리 유지 (heritage/hotspot/attraction/adventure/healing/shopping)
// = restaurant 카테고리 = 별도 스크립트 (= 가격대 분류 표준 정립 후)
// = STEP 2 = Gemini place_id 가짜 = TextSearch 호출로 검증된 place_id + photo 획득 (= AG3 매칭)
//
// 사용법:
//   node scripts/seed-gemini.mjs --city-id 19                          # Paris dry-run
//   node scripts/seed-gemini.mjs --city-id 19 --commit                 # 실제 적용
//   node scripts/seed-gemini.mjs --city-id 19 --skip-gemini --commit   # Gemini 재호출 X
//
// 단계:
//   1. Gemini 3 Flash Preview 호출 → docs/raw/{city}.json (6 카테고리 = place_id + shortform 톤)
//   2. Google Place Details (6 카테고리, place_id 직접 → photo + 좌표 + 리뷰) → Storage
//   3. DB 트랜잭션 (archived 태그 + UPDATE/INSERT)
//   4. HTML QA → docs/qa/{city}.html

import fs from 'fs';
import path from 'path';
import pg from 'pg';

// ──────────────────────────────────────────────────────────────────────────
// CLI 인자
// ──────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ARG = {
  cityId: parseInt(arg('--city-id'), 10) || null,
  cityName: arg('--city-name'),
  commit: args.includes('--commit'),
  skipGemini: args.includes('--skip-gemini'),
  skipWiki: args.includes('--skip-wiki'),
  skipPhoto: args.includes('--skip-photo'),
  keepCityHtml: args.includes('--keep-city-html'),  // 기본 = 폐기 (사용자 SSOT 2026-05-03 = 단일 index.html 만)
  markerStyle: arg('--marker-style') || 'a',  // a|b|c (a=이모지, b=SVG, c=Google기본)
};
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

if (!ARG.cityId && !ARG.cityName) {
  console.error('Usage: node scripts/seed-gemini.mjs --city-id <N> [--commit]');
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────
// .env 로드
// ──────────────────────────────────────────────────────────────────────────
const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DB 연결 + API key 로드
// ──────────────────────────────────────────────────────────────────────────
const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const GEMINI_KEY = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0].key_value;
const GOOGLE_KEY = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GOOGLE_MAPS_API_KEY' AND is_active=true`)).rows[0].key_value;
const SUPA_ANON = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='SUPABASE_ANON_KEY' AND is_active=true`)).rows[0].key_value;
const SUPA_PUB = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';

// ──────────────────────────────────────────────────────────────────────────
// 도시 정보 SELECT (name_en + country_code → 영문)
// ──────────────────────────────────────────────────────────────────────────
const COUNTRY_EN = {
  FR: 'France', GB: 'United Kingdom', UK: 'United Kingdom', US: 'USA', DE: 'Germany',
  ES: 'Spain', BE: 'Belgium', IT: 'Italy', NL: 'Netherlands', PT: 'Portugal',
  CH: 'Switzerland', AT: 'Austria', CZ: 'Czech Republic', PL: 'Poland', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', IE: 'Ireland', GR: 'Greece',
  JP: 'Japan', KR: 'South Korea', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan',
  SG: 'Singapore', TH: 'Thailand', VN: 'Vietnam', MY: 'Malaysia', ID: 'Indonesia',
  PH: 'Philippines', IN: 'India', AU: 'Australia', NZ: 'New Zealand',
  CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina', CL: 'Chile',
  AE: 'United Arab Emirates', TR: 'Turkey', IL: 'Israel', EG: 'Egypt', ZA: 'South Africa',
};

const cityRow = ARG.cityId
  ? (await c.query(`SELECT id, name, name_en, country, country_code, latitude::float AS lat, longitude::float AS lng FROM cities WHERE id=$1`, [ARG.cityId])).rows[0]
  : (await c.query(`SELECT id, name, name_en, country, country_code, latitude::float AS lat, longitude::float AS lng FROM cities WHERE LOWER(name_en)=LOWER($1) OR LOWER(name)=LOWER($1)`, [ARG.cityName])).rows[0];

if (!cityRow) {
  console.error('도시 못 찾음. cityId=' + ARG.cityId + ' cityName=' + ARG.cityName);
  process.exit(1);
}

const CITY = cityRow;
const CITY_NAME = CITY.name_en || CITY.name;  // 영문 우선
const COUNTRY = COUNTRY_EN[CITY.country_code] || CITY.country;
const CITY_KEY = CITY_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

console.log('═══ SEED SSOT 2026-05-02 — ' + CITY_NAME + ', ' + COUNTRY + ' ═══');
console.log('city_id: ' + CITY.id + ', center: (' + CITY.lat + ', ' + CITY.lng + ')');
console.log('mode: ' + (ARG.commit ? '⚠️ --commit (실제 적용)' : 'dry-run (DB 미변경)'));
console.log('');

const RAW_PATH = `docs/raw/${CITY_KEY}.json`;
const QA_PATH = `docs/qa/${CITY_KEY}.html`;
fs.mkdirSync('docs/raw', { recursive: true });
fs.mkdirSync('docs/qa', { recursive: true });

// ──────────────────────────────────────────────────────────────────────────
// 상수 — lucide SVG paths (STEP 5 HTML + STEP 6 통합 페이지 공유)
// ──────────────────────────────────────────────────────────────────────────
const LUCIDE_PATHS_FOR_HTML = {
  bts_venue:   '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  heritage:    '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  hotspot:     '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  attraction:  '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  adventure:   '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  healing:     '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
  shopping:    '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  restaurant:  '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
};

// ──────────────────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────────────────
function dKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ──────────────────────────────────────────────────────────────────────────
// STEP 1 — Gemini 3 Flash 큐레이션 (헌법 §1, §2)
// ──────────────────────────────────────────────────────────────────────────
let geminiData;
if (ARG.skipGemini && fs.existsSync(RAW_PATH)) {
  console.log('[1] Gemini skip (cache: ' + RAW_PATH + ')');
  geminiData = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));
} else {
  console.log('[1] Gemini 3 Flash Preview 호출 (v3 프롬프트)...');
  // ⚠️ 수정금지(승인필요) 2026-05-12 v3 = 사용자 SSOT 확정 (= 브뤼셀 시뮬 검증)
  // = Korean travelers 명시 + 가짜 위험 필드 5개 제거 + selection_reason_ko 신규 + shortform_ko 강화
  // = 컬럼 매핑: summary_ko ← selection_reason_ko / editorial_summary ← shortform_ko
  const PROMPT = `You are a travel data assistant for KOREAN TRAVELERS.
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

CITY: ${CITY_NAME}
COUNTRY: ${COUNTRY}
CITY_CENTER: { lat: ${CITY.lat}, lng: ${CITY.lng} }
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

For each of the 6 categories below, return TOP 20 most famous places
ordered by KOREAN TRAVELERS' popularity (= 인스타 성지, 한국 블로그 빈도,
유튜브 vlog 등장 빈도 우선 = NOT Western tourist ranking).
(Note: restaurant category is intentionally excluded — separate prompt with price-tier classification.)

Categories:
1. heritage    — historical sites and museums
2. hotspot     — photogenic viewpoints, panoramic photo spots, rooftop and terraces
3. attraction  — tourist attractions (theme parks, zoos, aquariums)
4. adventure   — adventure places and activity spots
5. healing     — parks, gardens, peaceful nature spots
6. shopping    — shopping places and markets

For each place include:
- rank (1-20, Korean traveler popularity order)
- name_en (English official name)
- name_local (local language name, if different — for TS matching)
- name_ko (Korean name commonly used by Korean travelers)
- lat, lng (decimal degrees)
- address (FULL street address with NUMBER + street + postal code + city)
- summary_ko (한국어 한 줄 = 한국 여행객 사이 트렌드 = 인스타 성지/최근 핫한 지역/한국 vlog 노출 빈도 등 사회적 검증 근거)
- editorial_summary (한국어 한 줄 = 장소에 대한 코믹/위트 있는 설명 = 감성/재미 후킹 카피 = Claude 톤. 단순 정보 X, 짧고 강하게)
- distance_km_from_center (haversine from CITY_CENTER, 1 decimal)
- day_zone: "core" if distance_km_from_center <= 10 (day 1 walkable from city center)
         OR "outskirt" if 10 < distance_km_from_center <= 100 (day 2+ day-trip required)
- estimated_price_eur (입장료 1인 EUR. 식당이면 1인당 평균. 무료=0. 확실하지 않으면 null. ⚠️ shopping 카테고리는 항상 null = 쇼핑은 1인당 가격 개념 없음)

OUTPUT (strict JSON, no markdown fences):
{
  "city": "${CITY_NAME}",
  "country": "${COUNTRY}",
  "center": { "lat": ${CITY.lat}, "lng": ${CITY.lng} },
  "radius_km": 100,
  "results": {
    "heritage":   [ ...20 items ],
    "hotspot":    [ ...20 items ],
    "attraction": [ ...20 items ],
    "adventure":  [ ...20 items ],
    "healing":    [ ...20 items ],
    "shopping":   [ ...20 items ]
  }
}`;

  const t0 = Date.now();
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 50000, thinkingConfig: { thinkingBudget: 0 } },  // ⚠️ 수정금지(승인필요) — 헌법 §1 (응답 잘림 방지)
    }),
    signal: AbortSignal.timeout(420000),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const respJson = await resp.json();
  if (respJson.error) { console.error('❌ Gemini: ' + JSON.stringify(respJson.error)); await c.end(); process.exit(1); }

  const usage = respJson.usageMetadata || {};
  const cost = (usage.promptTokenCount * 0.075 / 1e6) + (usage.candidatesTokenCount * 0.30 / 1e6);
  console.log('  ' + elapsed + ' 초, ' + usage.totalTokenCount + ' tokens, $' + cost.toFixed(4));

  const text = respJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
  fs.writeFileSync(RAW_PATH + '.raw.txt', text);
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) {
    console.error('❌ JSON 미발견. raw: ' + RAW_PATH + '.raw.txt');
    await c.end(); process.exit(1);
  }
  // 응답 잘림 복구: 정상 parse 실패 시 = 마지막 valid `}` 부터 닫기 추정
  geminiData = (function recoverJson() {
    const candidate = text.slice(jsonStart, text.lastIndexOf('}') + 1);
    try { return JSON.parse(candidate); } catch (e) {}
    // 잘림 복구: 카테고리별 array 닫기 + results 닫기 + 전체 닫기
    for (let endIdx = text.length - 1; endIdx > jsonStart; endIdx--) {
      if (text[endIdx] !== '}') continue;
      const trimmed = text.slice(jsonStart, endIdx + 1);
      for (const suffix of [']}}', ']}', '}', '']) {
        try {
          const parsed = JSON.parse(trimmed + suffix);
          if (parsed.results) {
            console.log('  ⚠️ 응답 잘림 자동 복구 (suffix: ' + (suffix || '없음') + ')');
            return parsed;
          }
        } catch (e) {}
      }
    }
    return null;
  })();
  if (!geminiData) {
    console.error('❌ JSON 파싱 + 복구 실패. raw: ' + RAW_PATH + '.raw.txt');
    await c.end(); process.exit(1);
  }
  fs.writeFileSync(RAW_PATH, JSON.stringify(geminiData, null, 2));
  console.log('  saved: ' + RAW_PATH);
}

// 평면화 + 카테고리 표시
const allRows = [];
for (const [cat, list] of Object.entries(geminiData.results || {})) {
  if (!Array.isArray(list)) continue;
  for (const p of list) {
    p.cat = cat;
    allRows.push(p);
  }
}
console.log('  총 ' + allRows.length + ' 행 (7 카테고리)\n');

// ──────────────────────────────────────────────────────────────────────────
// STEP 2 — 이미지 매칭 = 6 카테고리 = Place Details (place_id 직접)
// ⚠️ 수정금지(승인필요) 2026-05-08 = 사용자 명시 = 새 표준
// = Wikipedia 단계 폐기
// = 6 카테고리 (heritage/hotspot/attraction/adventure/healing/shopping) = Place Details 1 회
// = restaurant 카테고리 = 이 스크립트에서 제외 (= 별도 스크립트로 처리 예정 = 가격대 분류)
// ──────────────────────────────────────────────────────────────────────────
const SIX_CATS = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];

async function uploadPhotoToStorage(photoName, cat, placeId) {
  // (a) PhotoMedia GET binary
  const phUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_KEY}&maxHeightPx=800&maxWidthPx=1200`;
  const phResp = await fetch(phUrl, { signal: AbortSignal.timeout(30000) });
  if (phResp.status === 429) { await sleep(60000); return null; }
  if (!phResp.ok) return null;
  const ab = await phResp.arrayBuffer();
  const binary = Buffer.from(ab);

  // (b) Storage upload
  const fileName = `${CITY.id}/${cat}/${placeId}.jpg`;
  const upResp = await fetch(`${SUPA_PUB}/storage/v1/object/place-images/${fileName}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${SUPA_ANON}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: binary,
  });
  if (!upResp.ok) return null;
  return `${SUPA_PUB}/storage/v1/object/public/place-images/${fileName}`;
}

if (ARG.skipPhoto) {
  console.log('[2] TextSearch + PhotoMedia skip\n');
} else {
  // ⚠️ 수정금지(승인필요) 2026-05-12 v3 = 사용자 SSOT
  // = Gemini place_id 폐기 (= 가짜 위험 1주일 디버깅 결과)
  // = AG3 매칭 = TextSearch (textQuery = name_en + address) → 검증된 place_id + photo
  // = 매칭 우선순위: 행정주소 > 장소명 (= 도시 + 국가 명시로 동명 회피)
  const sixCatTargets = allRows.filter(p => SIX_CATS.includes(p.cat));
  console.log('[2] TextSearch + PhotoMedia (6 카테고리, AG3 매칭 = 주소 > 이름): ' + sixCatTargets.length + ' 행');
  let tsOk = 0, tsSkipNoMatch = 0;
  for (let i = 0; i < sixCatTargets.length; i++) {
    const p = sixCatTargets[i];
    process.stdout.write(`\r  [${i + 1}/${sixCatTargets.length}] ${(p.name_en || '').slice(0, 30)}                    `);

    if (!p.name_en) { tsSkipNoMatch++; continue; }

    try {
      // TextSearch = AG3 매칭 (행정주소 우선, 동명 회피용 도시명+국가명 강제 포함)
      // = textQuery 안에 좌표 X (= LLM 노이즈), locationBias 안 씀 (= memory feedback_place_api_verified_pattern.md)
      const queryParts = [p.name_en];
      if (p.address) queryParts.push(p.address);  // = 행정주소 우선 (사용자 SSOT)
      else queryParts.push(CITY_NAME, COUNTRY);   // = 주소 X 일 때 도시 + 국가 명시
      const textQuery = queryParts.join(' ');

      // ⚠️ 수정금지(승인필요) 2026-05-15 = languageCode: 'ko' (= Gemini 한국어 ↔ TS 한국어 검증)
      const tsResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.userRatingCount,places.types,places.primaryType,places.priceRange,places.googleMapsUri',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ textQuery, pageSize: 1, languageCode: 'ko' }),
        signal: AbortSignal.timeout(15000),
      });
      if (!tsResp.ok) { tsSkipNoMatch++; continue; }
      const tsj = await tsResp.json();
      const top = tsj.places?.[0];
      if (!top?.id) { tsSkipNoMatch++; continue; }

      // TS 응답 = 14 요소 = 2차 DB 입력용 보강
      p.google_place_id = top.id;
      p.google_review_count = top.userRatingCount ?? null;
      p.primary_type = top.primaryType ?? null;
      p.types = top.types ?? null;
      if (top.location?.latitude && top.location?.longitude) {
        // TS 좌표 = 검증됨 = Gemini 좌표 덮어쓰기
        p.lat = top.location.latitude;
        p.lng = top.location.longitude;
      }
      if (top.formattedAddress) p.address = top.formattedAddress;  // = TS 포맷팅 주소 우선
      if (top.displayName?.text && !p.name_local) p.name_local = top.displayName.text;

      // ⚠️ 추가 = 2026-05-15 사용자 SSOT = TS priceRange.endPrice (= 비싼 쪽) 임시 저장
      // = UPDATE/INSERT 단계에서 GREATEST(기존, Gemini, ts_price_eur) 비교용
      if (top.priceRange?.endPrice?.units) {
        p.ts_price_eur = parseFloat(top.priceRange.endPrice.units) || 0;
      }
      // ⚠️ 2026-05-15 = 13번째 SSOT = google_maps_uri = 최후의 보루
      if (top.googleMapsUri) {
        p.google_maps_uri = top.googleMapsUri;
      }

      // PhotoMedia = 3차 DB 입력
      const photoName = top.photos?.[0]?.name;
      if (!photoName) continue;
      const finalUrl = await uploadPhotoToStorage(photoName, p.cat, top.id);
      if (!finalUrl) continue;

      p.image_url_photo = finalUrl;
      p.image_source_resolved = 'google_photo';
      tsOk++;

      await sleep(6000);  // 헌법 §3: 분당 10 한도
    } catch (e) {}
  }
  console.log('\n  TextSearch + PhotoMedia OK: ' + tsOk + ' / ' + sixCatTargets.length
    + (tsSkipNoMatch > 0 ? ` (매칭 실패 = ${tsSkipNoMatch})` : '') + '\n');

  // ⚠️ 수정금지(승인필요) 2026-05-08 = 사용자 명시 = restaurant 카테고리 = 별도 스크립트 처리
  // = 이 스크립트에서는 restaurant 발굴/이미지 매칭 X
  // = 다음 단계 = 가격대 (top 10 × 3 가격대) 분류로 별도 정립
  const restCount = allRows.filter(p => p.cat === 'restaurant').length;
  if (restCount > 0) {
    console.log(`[2b] restaurant ${restCount} 행 = 이 스크립트에서 처리 X = 별도 스크립트 예정\n`);
  }
}

// 최종 image_url 결정 (= Wikipedia 단계 폐기 = image_url_photo 만)
for (const p of allRows) {
  p.image_url_final = p.image_url_photo || null;
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 4 — DB 트랜잭션 (헌법 §5)
// ──────────────────────────────────────────────────────────────────────────
console.log('[4] DB 적용 (모드: ' + (ARG.commit ? 'COMMIT' : 'dry-run') + ')');

if (!ARG.commit) {
  console.log('  [dry-run] 다음 작업 시뮬:');
  console.log('    - 기존 ' + CITY_NAME + ' 행 = phase_tags + "archived-2026-05" union');
  console.log('    - Gemini 신규 = ' + allRows.length + ' 행 INSERT/UPDATE (collection_phase=gemini3-2026-05)');
  console.log('    - 매칭 = 통합 SSOT (시드+AG3) = 행정주소 > 장소명 > 좌표 (= place_id X)');
  console.log('    - 고정 행 (bts_venue/army_zone/merch_store) = 절대 건드리지 X');
  // ⚠️ 수정금지(승인필요) 2026-05-12 = 사용자 SSOT 매칭 순서 (= COMMIT 분기와 동일)
  const exist = await c.query(`
    SELECT id, name_en, address, latitude::float AS lat, longitude::float AS lng, seed_category
    FROM place_seed_raw
    WHERE city_id = $1 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
  `, [CITY.id]);
  const normAddrDry = (s) => (s || '')
    .toLowerCase().replace(/[.,;:!?'"()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const addrMatchDry = (a, b) => {
    if (!a || !b) return false;
    const na = normAddrDry(a), nb = normAddrDry(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length >= 30 && nb.length >= 30 && (na.includes(nb) || nb.includes(na))) return true;
    return false;
  };
  let byAddr = 0, byName = 0, byCoord = 0, newCnt = 0;
  for (const p of allRows) {
    const pNameKey = (p.name_en || '').trim().toLowerCase();
    if (exist.rows.find(e => addrMatchDry(e.address, p.address))) byAddr++;
    else if (pNameKey && exist.rows.find(e => e.name_en && e.name_en.trim().toLowerCase() === pNameKey)) byName++;
    else if (exist.rows.find(e => e.lat != null && e.lng != null && dKm({ lat: e.lat, lng: e.lng }, { lat: p.lat, lng: p.lng }) < 0.01)) byCoord++;
    else newCnt++;
  }
  console.log('    [통합 매칭 분석 (= 시드 + AG3 공통)]');
  console.log('    1순위 행정주소 일치: ' + byAddr);
  console.log('    2순위 장소명 일치: ' + byName);
  console.log('    3순위 좌표 100m 일치: ' + byCoord);
  console.log('    매칭 합계 (UPDATE 예정): ' + (byAddr + byName + byCoord));
  console.log('    신규 INSERT 예정: ' + newCnt);
  console.log('    옛 행 archived 태그 추가: ' + exist.rows.length);
} else {
  await c.query('BEGIN');
  try {
    // (a) 기존 행 archived 태그
    await c.query(`
      UPDATE place_seed_raw SET
        phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['archived-2026-05']::text[])))
      WHERE city_id = $1
        AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
        AND NOT ('gemini3-2026-05' = ANY(COALESCE(phase_tags, ARRAY[]::text[])))
    `, [CITY.id]);

    // (b) 기존 행 (army/merch 제외) rank = -id 임시 set (UNIQUE 충돌 회피)
    await c.query(`
      UPDATE place_seed_raw SET rank = -id
      WHERE city_id = $1 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    `, [CITY.id]);

    // (c) 기존 행 SELECT (= 통합 매칭용 = 행정주소 + 이름 + 좌표)
    // ⚠️ 수정금지(승인필요) 2026-05-12 = 사용자 SSOT = 통합 매칭 = 시드 + AG3 공통
    // = 1/2/3순위: 행정주소 > 장소명 > 좌표 (= TS 전 = place_id 모름)
    // = 4순위 = TS+PM (= Google API = 비용 발생) = 매칭 실패 시에만
    // ⚠️ 2026-05-15 = 5 단계 매칭 (= name_en + name_local + name_ko + google_maps_uri 모두 SELECT)
    const existRows = (await c.query(`
      SELECT id, name_en, name_local, name_ko, address, google_maps_uri, latitude::float AS lat, longitude::float AS lng
      FROM place_seed_raw
      WHERE city_id = $1 AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
    `, [CITY.id])).rows;
    console.log('  existRows: ' + existRows.length + ' 행');

    // ⚠️ 수정금지(승인필요) 2026-05-12 = 사용자 SSOT
    // = 시드 UPDATE 매칭 우선순위 = 행정주소 > 장소명 > 좌표 (= place_id X = TS 전)
    // = 주소 normalization = LOWER + 구두점 제거 + 공백 정규화
    const normAddr = (s) => (s || '')
      .toLowerCase()
      .replace(/[.,;:!?'"()\[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // = 주소 매칭 = 부분일치 (= "X, Belgium" vs "X" 흡수). 최소 30 자 이상에서만 substring 매칭
    // = 짧은 주소 (= 거리명만) = 정확 일치만 (= 우연 매칭 방지)
    const addrMatch = (a, b) => {
      if (!a || !b) return false;
      const na = normAddr(a), nb = normAddr(b);
      if (!na || !nb) return false;
      if (na === nb) return true;
      if (na.length >= 30 && nb.length >= 30 && (na.includes(nb) || nb.includes(na))) return true;
      return false;
    };

    // Gemini 응답 dedup (같은 lower name = 1 행 + 카테고리 union)
    const dedup = new Map();
    for (const p of allRows) {
      const key = (p.name_en || '').trim().toLowerCase();
      if (!key) continue;
      if (!dedup.has(key)) {
        dedup.set(key, { ...p, _cats: [p.cat] });
      } else {
        dedup.get(key)._cats.push(p.cat);
      }
    }
    const dedupRows = [...dedup.values()];
    if (dedupRows.length < allRows.length) {
      console.log('  Gemini 응답 dedup: ' + allRows.length + ' → ' + dedupRows.length + ' (' + (allRows.length - dedupRows.length) + ' 중복 카테고리 union)');
    }

    let updated = 0, inserted = 0;
    let tmpRank = 9990000;
    for (const p of dedupRows) {
      tmpRank++;
      // ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT = 5 단계 매칭 (= 시드 + AG3 + upsertPlace)
      // = 1순위 행정주소 일치 (= 부분일치 흡수)
      // = 2순위 google_maps_uri 일치 (= PID 없을 때 강력 매칭 키)
      // = 3순위 좌표 10m
      // = 4순위 이름 9 조합 (name_en/name_local/name_ko 셋 중 한 쌍 일치)
      //   [[feedback_name_match_9_combinations]]
      // = 5순위 = 매칭 실패 → TS+PM 호출 (= 신규 발굴 분기)
      const normName = (s) => (s || '').trim().toLowerCase();
      const pNames = [normName(p.name_en), normName(p.name_local), normName(p.name_ko)].filter(Boolean);
      const matched =
        existRows.find(e => addrMatch(e.address, p.address)) ||
        existRows.find(e => e.google_maps_uri && p.google_maps_uri && e.google_maps_uri === p.google_maps_uri) ||
        existRows.find(e => e.lat != null && e.lng != null && dKm({ lat: e.lat, lng: e.lng }, { lat: p.lat, lng: p.lng }) < 0.01) ||
        existRows.find(e => {
          const eNames = [normName(e.name_en), normName(e.name_local), normName(e.name_ko)].filter(Boolean);
          return pNames.some(pn => eNames.includes(pn));
        });
      const catTags = p._cats || [p.cat];
      const photoUrls = p.google_place_id ? JSON.stringify([{ name: 'places/' + p.google_place_id + '/photos/' }]) : null;
      const categoryTags = JSON.stringify([p.cat]);

      // ⚠️ 2026-05-15 = shopping 카테고리는 price_eur 자체 부적합 (= 사용자 SSOT)
      // = 1인당 입장료/평균식대 개념 없음 = 강제 NULL
      const priceEurForSql = p.cat === 'shopping'
        ? 0
        : Math.max(parseFloat(p.estimated_price_eur || 0), parseFloat(p.ts_price_eur || 0));

      if (matched) {
        // 헌법 §5 COALESCE 옛 우선: 검증된 image/좌표/place_id/name 보존
        // Gemini 우선: 큐레이션 메타 (rank/category/day_zone/summary/primary_type)
        await c.query(`
          UPDATE place_seed_raw SET
            seed_category = $2,
            rank = $18,
            gemini_rank = $3,
            -- 옛 우선 (검증된 데이터 보존)
            name_en = COALESCE(name_en, $4),
            name_ko = COALESCE(name_ko, $5),
            name_local = COALESCE(name_local, $6),
            latitude = COALESCE(latitude, $7),
            longitude = COALESCE(longitude, $8),
            address = COALESCE(address, $9),
            google_review_count = COALESCE(google_review_count, $10),
            google_maps_uri = COALESCE(google_maps_uri, $21),
            image_url = COALESCE(image_url, $15),
            image_attribution = COALESCE(image_attribution, $16),
            -- Gemini 우선 (큐레이션 메타)
            google_primary_type = $11,
            editorial_summary = $12,
            summary_ko = $19,
            day_zone = $13,
            distance_km_from_center = $14,
            price_eur = GREATEST(COALESCE(price_eur, 0), $20::real),
            image_updated_at = NOW(),
            collection_phase = 'gemini3-2026-05',
            category_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(category_tags, ARRAY[]::text[]) || $17::text[]))),
            phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['gemini3','gemini3-2026-05']::text[])))
          WHERE id = $1
        `, [matched.id, p.cat, p.rank,
          p.name_en, p.name_ko, p.name_local,
          p.lat, p.lng, p.address || null,
          p.google_review_count || null, p.primary_type || null,
          p.editorial_summary ?? p.shortform_ko ?? null,
          p.day_zone || null, p.distance_km_from_center || null,
          p.image_url_final, null,
          catTags, tmpRank, p.summary_ko ?? p.selection_reason_ko ?? null,
          priceEurForSql, p.google_maps_uri || null]);
        updated++;
      } else {
        await c.query(`
          INSERT INTO place_seed_raw (
            city_id, seed_category, rank, gemini_rank,
            name_en, name_ko, name_local,
            latitude, longitude, address,
            google_review_count, google_primary_type,
            editorial_summary, summary_ko,
            day_zone, distance_km_from_center,
            image_url, image_attribution, price_eur,
            google_maps_uri,
            collection_phase, category_tags, phase_tags,
            created_at, image_updated_at
          ) VALUES (
            $1, $2, $18, $3,
            $4, $5, $6,
            $7, $8, $9,
            $10, $11,
            $12, $19,
            $13, $14,
            $15, $16, $20,
            $21,
            'gemini3-2026-05', $17::text[], ARRAY['gemini3','gemini3-2026-05']::text[],
            NOW(), NOW()
          )
          ON CONFLICT (city_id, (lower(trim(name_en))))
          WHERE name_en IS NOT NULL AND trim(name_en) <> ''
          DO UPDATE SET
            seed_category = EXCLUDED.seed_category,
            gemini_rank = EXCLUDED.gemini_rank,
            day_zone = EXCLUDED.day_zone,
            distance_km_from_center = EXCLUDED.distance_km_from_center,
            editorial_summary = EXCLUDED.editorial_summary,
            summary_ko = EXCLUDED.summary_ko,
            -- ⚠️ 사용자 SSOT = WK 이미지 우선 보존 = COALESCE 옛 우선
            image_url = COALESCE(place_seed_raw.image_url, EXCLUDED.image_url),
            google_maps_uri = COALESCE(place_seed_raw.google_maps_uri, EXCLUDED.google_maps_uri),
            price_eur = GREATEST(COALESCE(place_seed_raw.price_eur, 0), COALESCE(EXCLUDED.price_eur, 0)),
            phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(place_seed_raw.phase_tags || EXCLUDED.phase_tags)))
        `, [CITY.id, p.cat, p.rank,
          p.name_en, p.name_ko || null, p.name_local || null,
          p.lat, p.lng, p.address || null,
          p.google_review_count || null, p.primary_type || null,
          p.editorial_summary ?? p.shortform_ko ?? null,
          p.day_zone || null, p.distance_km_from_center || null,
          p.image_url_final, null,
          catTags, tmpRank, p.summary_ko ?? p.selection_reason_ko ?? null,
          priceEurForSql, p.google_maps_uri || null]);
        inserted++;
      }
    }
    console.log('  UPDATE: ' + updated + ', INSERT: ' + inserted);

    // (d) rank 재정정 (gemini_rank 우선, 없으면 rc DESC; army/merch 제외)
    await c.query(`
      UPDATE place_seed_raw SET rank = -id
      WHERE city_id = $1 AND seed_category NOT IN ('bts_army_zone','bts_merch_store')
    `, [CITY.id]);
    const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant', 'bts_venue'];
    for (const cat of cats) {
      await c.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (
            ORDER BY google_review_count DESC NULLS LAST, id
          ) AS rk
          FROM place_seed_raw WHERE city_id = $1 AND seed_category = $2
        )
        UPDATE place_seed_raw SET rank = ranked.rk FROM ranked WHERE place_seed_raw.id = ranked.id
      `, [CITY.id, cat]);
    }
    await c.query(`UPDATE place_seed_raw SET rank = 1 WHERE city_id = $1 AND seed_category IN ('bts_army_zone','bts_merch_store')`, [CITY.id]);

    await c.query('COMMIT');
    console.log('  ✅ COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('  ❌ ROLLBACK: ' + e.message);
    throw e;
  }
}
console.log('');

// ──────────────────────────────────────────────────────────────────────────
// 카테고리 상수 (STEP 5 + STEP 6 공유)
// ──────────────────────────────────────────────────────────────────────────
const CAT_LABEL = {
  heritage: '🏛️ Heritage', hotspot: '✨ Hotspot', attraction: '🗿 Attraction',
  adventure: '⛰️ Adventure', healing: '🌿 Healing', shopping: '🛍️ Shopping', restaurant: '🍽️ Restaurant',
};
const CAT_COLOR = {
  bts_venue: '#9333ea', heritage: '#92400e', hotspot: '#eab308',
  attraction: '#f97316', adventure: '#dc2626', healing: '#16a34a',
  shopping: '#ec4899', restaurant: '#0891b2',
};
const CAT_EMOJI = {
  bts_venue: '⭐', heritage: '🏛️', hotspot: '✨', attraction: '🗿',
  adventure: '⛰️', healing: '🌿', shopping: '🛍️', restaurant: '🍽️',
};

// ──────────────────────────────────────────────────────────────────────────
// STEP 5 — 도시별 HTML (사용자 SSOT 2026-05-03 = 폐기, 단일 index.html 만)
//   기본 = SKIP. --keep-city-html 옵션 시에만 진행 (참고용 / 디버깅).
// ──────────────────────────────────────────────────────────────────────────
if (!ARG.keepCityHtml) {
  console.log('[5] 도시별 HTML 폐기 (사용자 SSOT 2026-05-03). --keep-city-html 옵션으로 활성화.');
} else {
console.log('[5] HTML QA 생성: ' + QA_PATH);

// bts_venue 행 SELECT (지도 중심 + 디폴트 마커)
const venueRow = (await c.query(`
  SELECT id, name_en, name_ko, latitude::float AS lat, longitude::float AS lng,
    address, image_url
  FROM place_seed_raw
  WHERE city_id = $1 AND seed_category = 'bts_venue'
  ORDER BY rank ASC LIMIT 1
`, [CITY.id])).rows[0] || { name_en: 'BTS Venue', lat: CITY.lat, lng: CITY.lng, address: '' };

// 카드 데이터 (id 부여 = idx, JS 에서 사용)
const cardData = allRows
  .filter(p => p.lat != null && p.lng != null)
  .map((p, i) => ({
    id: 'p' + i, cat: p.cat, rank: p.rank, name_en: p.name_en, name_ko: p.name_ko,
    lat: p.lat, lng: p.lng, address: p.address, img: p.image_url_final,
    // ⚠️ 수정금지(승인필요) 2026-05-08 = shortform 우선 + summary fallback
    summary_en: p.shortform_en || p.summary_en, day_zone: p.day_zone, dist: p.distance_km_from_center,
  }));

function cardHtml(p, jsId) {
  const img = p.image_url_final;
  const color = CAT_COLOR[p.cat] || '#666';
  const emoji = CAT_EMOJI[p.cat] || '📍';
  return `
    <div class="card" id="card-${jsId}" data-id="${jsId}" onclick="toggleCard('${jsId}')">
      <div class="card-img-wrap">
        ${img ? `<img src="${escHtml(img)}" loading="lazy" />` : '<div class="img-missing">❌ 이미지 X</div>'}
        <div class="rank-badge" style="background:${color}">${emoji} #${p.rank}</div>
        <div class="src-badge ${p.image_source_resolved || 'none'}">${(p.image_source_resolved || 'none').toUpperCase()}</div>
      </div>
      <div class="card-body">
        <div class="name-en">${escHtml(p.name_en)}</div>
        ${p.name_ko ? `<div class="name-ko">${escHtml(p.name_ko)}</div>` : ''}
        <div class="address">${escHtml(p.address || '')}</div>
        <div class="meta"><span class="dist">${p.distance_km_from_center}km</span><span class="day ${p.day_zone}">${(p.day_zone || '').toUpperCase()}</span><span class="rc">rc ${(p.google_review_count || 0).toLocaleString()}</span></div>
        <div class="summary"><b>EN:</b> ${escHtml(p.shortform_en || p.summary_en || '')}</div>
        ${(p.shortform_ko || p.summary_ko) ? `<div class="summary"><b>KO:</b> ${escHtml(p.shortform_ko || p.summary_ko)}</div>` : ''}
      </div>
    </div>`;
}

let cardIdx = 0;
const sections = Object.entries(geminiData.results || {}).map(([cat, list]) => {
  if (!Array.isArray(list)) return '';
  const withImg = list.filter(p => p.image_url_final).length;
  const cards = list.map(p => {
    if (p.lat == null || p.lng == null) return '';
    const jsId = 'p' + (cardData.findIndex(d => d.name_en === p.name_en && d.cat === p.cat));
    return cardHtml(p, jsId);
  }).join('\n');
  return `<div class="cat-section" id="cat-${cat}">
    <div class="cat-header" style="border-left:4px solid ${CAT_COLOR[cat]}"><span>${CAT_LABEL[cat] || cat} — ${list.length} 곳</span><span class="cat-stat">이미지 ${withImg}/${list.length}</span></div>
    <div class="grid">${cards}</div>
  </div>`;
}).join('\n');

const totalImg = allRows.filter(p => p.image_url_final).length;

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>${CITY_NAME} — BTS 약도</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #faf8ff; padding: 12px; color: #222; }
h1 { font-size: 20px; margin-bottom: 4px; color: #6b21a8; }
.meta-top { color: #666; font-size: 12px; margin-bottom: 10px; }
.summary-bar { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.pill { background: white; border-radius: 14px; padding: 4px 10px; font-size: 11px; border: 1px solid #ddd; }
.pill.style-tag { background: #9333ea; color: white; border: 0; font-weight: bold; }
/* 지도 = sticky top */
#map-wrap { position: sticky; top: 0; z-index: 100; background: white; border-radius: 12px; padding: 10px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(147,51,234,0.15); }
#map { width: 100%; height: 380px; border-radius: 8px; background: #f8f7fb; }
.legend { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; font-size: 11px; }
.legend-item { display: flex; align-items: center; gap: 4px; padding: 3px 8px; background: #f8f7fb; border-radius: 8px; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
/* 카테고리 섹션 */
.cat-section { background: white; border-radius: 10px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.cat-header { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; margin-bottom: 10px; padding-left: 8px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
.cat-stat { font-size: 11px; color: #666; font-weight: normal; background: #fff8e1; padding: 2px 8px; border-radius: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.card { background: #fafafa; border: 2px solid transparent; border-radius: 10px; overflow: hidden; cursor: pointer; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(147,51,234,0.15); }
.card.selected { border-color: #9333ea; box-shadow: 0 4px 16px rgba(147,51,234,0.4); }
.card-img-wrap { position: relative; width: 100%; height: 130px; background: #e0e0e0; }
.card-img-wrap img { width: 100%; height: 100%; object-fit: cover; }
.img-missing { display: flex; align-items: center; justify-content: center; height: 100%; color: #c62828; font-size: 11px; }
.rank-badge { position: absolute; top: 6px; left: 6px; color: white; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
.src-badge { position: absolute; top: 6px; right: 6px; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; color: white; }
.src-badge.wikipedia { background: #4caf50; }
.src-badge.google_photo { background: #2196f3; }
.src-badge.none { background: #9e9e9e; }
.card-body { padding: 8px 10px; font-size: 12px; }
.name-en { font-weight: 600; font-size: 13px; margin-bottom: 1px; line-height: 1.3; }
.name-ko { color: #555; font-size: 11px; margin-bottom: 4px; }
.address { color: #888; font-size: 10px; margin-bottom: 4px; line-height: 1.3; }
.meta { display: flex; gap: 4px; }
.dist { font-size: 10px; color: #666; background: #f0f0f0; padding: 2px 6px; border-radius: 6px; }
.day { font-size: 9px; padding: 2px 6px; border-radius: 6px; font-weight: bold; }
.day.core { background: #c8e6c9; color: #2e7d32; }
.day.outskirt { background: #ffcdd2; color: #c62828; }
.rc { font-size: 11px; color: #666; }
.card .summary { font-size: 11px; color: #555; line-height: 1.5; margin-top: 6px; margin-bottom: 4px; }
.card .links { font-size: 11px; margin-top: 4px; }
.card .links a { color: #1976d2; text-decoration: none; }
/* 모달 = 큰 이미지 */
.modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 9999; cursor: pointer; align-items: center; justify-content: center; flex-direction: column; padding: 20px; }
.modal.open { display: flex; }
.modal img { max-width: 95%; max-height: 80vh; object-fit: contain; border-radius: 8px; }
.modal .name { color: white; font-size: 18px; margin-top: 16px; text-align: center; }
.modal-close { position: absolute; top: 16px; right: 24px; color: white; font-size: 32px; cursor: pointer; }
</style></head><body>
<h1>⭐ ${CITY_NAME} — BTS 공연장 약도</h1>
<p class="meta-top">디폴트: 공연장만 표시 · 카드 클릭 → 지도 마커 추가 · 마커 클릭 → 큰 이미지</p>
<div class="summary-bar">
  <span class="pill style-tag">MARKER ${ARG.markerStyle.toUpperCase()}</span>
  <span class="pill">📋 ${allRows.length} 곳</span>
  <span class="pill">🖼️ ${totalImg}/${allRows.length}</span>
  <span class="pill">🌍 core ${allRows.filter(p => p.day_zone === 'core').length} / outskirt ${allRows.filter(p => p.day_zone === 'outskirt').length}</span>
</div>

<div id="map-wrap">
  <div id="map"></div>
  <div class="legend">
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.bts_venue}"></span>⭐ 공연장</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.heritage}"></span>🏛️ 역사</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.hotspot}"></span>✨ 명소</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.attraction}"></span>🗿 관광</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.adventure}"></span>⛰️ 액티비티</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.healing}"></span>🌿 자연</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.shopping}"></span>🛍️ 쇼핑</span>
    <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.restaurant}"></span>🍽️ 식당</span>
  </div>
</div>

${sections}

<div id="modal" class="modal" onclick="closeModal()">
  <span class="modal-close">×</span>
  <img id="modal-img" />
  <div class="name" id="modal-name"></div>
</div>

<script>
const PLACES = ${JSON.stringify(cardData)};
const VENUE = ${JSON.stringify({ name: venueRow.name_en, name_ko: venueRow.name_ko, lat: venueRow.lat, lng: venueRow.lng, img: venueRow.image_url, address: venueRow.address })};
const COLORS = ${JSON.stringify(CAT_COLOR)};
const EMOJIS = ${JSON.stringify(CAT_EMOJI)};
const MARKER_STYLE = '${ARG.markerStyle}';
const BTS_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f8f7fb" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#e9e6f0" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#9333ea", weight: 1 }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#6b21a8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9d5ff" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcfce7" }] },
];

let map, markers = {}, venueMarker;
const selectedIds = new Set();

// lucide SVG paths (외부 const 동일)
const LUCIDE_PATHS = ${JSON.stringify(LUCIDE_PATHS_FOR_HTML)};

function makeIcon(cat, isVenue) {
  const color = COLORS[cat] || '#666';
  const innerSvg = LUCIDE_PATHS[cat] || '<circle cx="12" cy="12" r="6"/>';
  const size = isVenue ? 56 : 40;
  const iconSize = isVenue ? 28 : 20;
  const iconOffset = (size - iconSize) / 2;
  const scale = iconSize / 24;  // lucide viewBox 24
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + (size/2 - 2) + '" fill="' + color + '" stroke="white" stroke-width="3"/>' +
    '<g transform="translate(' + iconOffset + ',' + iconOffset + ') scale(' + scale + ')" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    innerSvg +
    '</g>' +
    '</svg>';
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size/2, size/2),
  };
}

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: VENUE.lat, lng: VENUE.lng },
    zoom: 11, styles: BTS_MAP_STYLE,
    disableDefaultUI: true, zoomControl: true,
  });
  // venue 마커 (디폴트, 항상 표시)
  venueMarker = new google.maps.Marker({
    position: { lat: VENUE.lat, lng: VENUE.lng }, map,
    icon: makeIcon('bts_venue', true), zIndex: 999,
    title: VENUE.name,
  });
  venueMarker.addListener('click', () => openModal(VENUE.img, VENUE.name + (VENUE.name_ko ? ' / ' + VENUE.name_ko : '')));
}

function toggleCard(id) {
  const place = PLACES.find(p => p.id === id);
  if (!place) return;
  const card = document.getElementById('card-' + id);
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    if (markers[id]) { markers[id].setMap(null); delete markers[id]; }
    card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    const m = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lng }, map,
      icon: makeIcon(place.cat, false), title: place.name_en,
    });
    m.addListener('click', () => openModal(place.img, place.name_en + (place.name_ko ? ' / ' + place.name_ko : '')));
    markers[id] = m;
    card.classList.add('selected');
  }
  fitBounds();
}

function fitBounds() {
  const b = new google.maps.LatLngBounds();
  b.extend({ lat: VENUE.lat, lng: VENUE.lng });
  for (const m of Object.values(markers)) b.extend(m.getPosition());
  if (Object.keys(markers).length === 0) {
    map.setCenter({ lat: VENUE.lat, lng: VENUE.lng }); map.setZoom(11);
  } else {
    map.fitBounds(b, { top: 60, right: 60, bottom: 60, left: 60 });
  }
}

function openModal(imgUrl, name) {
  if (!imgUrl) return;
  document.getElementById('modal-img').src = imgUrl;
  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&callback=initMap"></script>
</body></html>`;

fs.writeFileSync(QA_PATH, html);
console.log('  saved: ' + QA_PATH + ' (marker style: ' + ARG.markerStyle + ')');
console.log('  열기: file:///' + process.cwd().replace(/\\/g, '/') + '/' + QA_PATH);
}  // end if (ARG.keepCityHtml)

// ──────────────────────────────────────────────────────────────────────────
// STEP 6 — 통합 index.html (모든 commit 도시, inline JSON, 단일 페이지)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[6] 통합 index.html 갱신 (모든 commit 도시)');

// 모든 commit 된 도시 SELECT
const allCitiesQ = await c.query(`
  SELECT DISTINCT c.id, c.name_en, c.country, c.country_code,
    c.latitude::float AS lat, c.longitude::float AS lng,
    c.bts_concert_dates::text AS bts_dates
  FROM cities c
  JOIN place_seed_raw p ON p.city_id = c.id
  WHERE p.collection_phase = 'gemini3-2026-05'
  ORDER BY c.bts_concert_dates::text ASC NULLS LAST, c.name_en
`);

const cityData = {};
for (const city of allCitiesQ.rows) {
  const places = (await c.query(`
    SELECT id, seed_category AS cat, rank, name_en, name_ko,
      latitude::float AS lat, longitude::float AS lng,
      address, google_review_count, image_url, editorial_summary AS summary_en,
      summary_ko,
      day_zone, distance_km_from_center, image_attribution
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'gemini3-2026-05'
      AND seed_category NOT IN ('bts_venue','bts_army_zone','bts_merch_store')
      AND latitude IS NOT NULL
    ORDER BY seed_category, rank
  `, [city.id])).rows;
  const venueQ = (await c.query(`
    SELECT name_en, name_ko, latitude::float AS lat, longitude::float AS lng, image_url, address
    FROM place_seed_raw WHERE city_id = $1 AND seed_category = 'bts_venue' LIMIT 1
  `, [city.id])).rows[0];
  const key = city.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  cityData[key] = {
    id: city.id, name: city.name_en, country_code: city.country_code,
    bts_dates: city.bts_dates,
    center: { lat: city.lat, lng: city.lng },
    venue: venueQ ? { name: venueQ.name_en, name_ko: venueQ.name_ko, lat: venueQ.lat, lng: venueQ.lng, img: venueQ.image_url, address: venueQ.address } : { name: city.name_en + ' Center', lat: city.lat, lng: city.lng, img: null, address: '' },
    places,
  };
}

const cityKeys = Object.keys(cityData);
const defaultKey = cityKeys[0];
console.log('  통합 도시: ' + cityKeys.length + ' (' + cityKeys.join(', ') + ')');

const indexHtml = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>BTS 약도 — 통합 검수</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; background: #faf8ff; color: #222; }
header { background: linear-gradient(135deg, #6b21a8, #9333ea); color: white; padding: 14px 16px; position: sticky; top: 0; z-index: 200; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
header h1 { font-size: 18px; margin-bottom: 8px; }
.city-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.city-tab { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 12px; border-radius: 16px; font-size: 12px; cursor: pointer; transition: background 0.15s; }
.city-tab:hover { background: rgba(255,255,255,0.3); }
.city-tab.active { background: white; color: #6b21a8; font-weight: bold; }
.city-tab .date { font-size: 10px; opacity: 0.7; margin-left: 4px; }
main { padding: 12px; }
.summary-bar { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; font-size: 12px; }
.pill { background: white; border-radius: 14px; padding: 4px 10px; border: 1px solid #ddd; }
#map-wrap { position: sticky; top: 70px; z-index: 100; background: white; border-radius: 12px; padding: 10px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(147,51,234,0.15); }
#map { width: 100%; height: 380px; border-radius: 8px; background: #f8f7fb; }
.legend { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; font-size: 11px; }
.legend-item { display: flex; align-items: center; gap: 4px; padding: 3px 8px; background: #f8f7fb; border-radius: 8px; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.cat-section { background: white; border-radius: 10px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.cat-header { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; margin-bottom: 10px; padding-left: 8px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.card { background: #fafafa; border: 2px solid transparent; border-radius: 10px; overflow: hidden; cursor: pointer; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(147,51,234,0.15); }
.card.selected { border-color: #9333ea; box-shadow: 0 4px 16px rgba(147,51,234,0.4); }
.card-img-wrap { position: relative; width: 100%; height: 130px; background: #e0e0e0; }
.card-img-wrap img { width: 100%; height: 100%; object-fit: cover; }
.img-missing { display: flex; align-items: center; justify-content: center; height: 100%; color: #c62828; font-size: 11px; }
.rank-badge { position: absolute; top: 6px; left: 6px; color: white; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
.src-badge { position: absolute; top: 6px; right: 6px; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; color: white; }
.src-badge.wikipedia { background: #4caf50; }
.src-badge.google_photo { background: #2196f3; }
.src-badge.none { background: #9e9e9e; }
.card-body { padding: 8px 10px; font-size: 12px; }
.name-en { font-weight: 600; font-size: 13px; margin-bottom: 1px; line-height: 1.3; }
.name-ko { color: #555; font-size: 11px; margin-bottom: 4px; }
.address { color: #888; font-size: 10px; margin-bottom: 4px; line-height: 1.3; }
.meta { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.dist { font-size: 10px; color: #666; background: #f0f0f0; padding: 2px 6px; border-radius: 6px; }
.day { font-size: 9px; padding: 2px 6px; border-radius: 6px; font-weight: bold; }
.day.core { background: #c8e6c9; color: #2e7d32; }
.day.outskirt { background: #ffcdd2; color: #c62828; }
.rc { font-size: 11px; color: #666; }
.card .summary { font-size: 11px; color: #555; line-height: 1.5; margin-top: 6px; margin-bottom: 4px; }
.modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 9999; cursor: pointer; align-items: center; justify-content: center; flex-direction: column; padding: 20px; }
.modal.open { display: flex; }
.modal img { max-width: 95%; max-height: 80vh; object-fit: contain; border-radius: 8px; }
.modal .name { color: white; font-size: 18px; margin-top: 16px; text-align: center; }
.modal-close { position: absolute; top: 16px; right: 24px; color: white; font-size: 32px; cursor: pointer; }
</style></head><body>
<header>
  <h1>⭐ BTS 약도 — 통합 검수 (도시별 표준 일관)</h1>
  <div class="city-tabs">
    ${cityKeys.map(k => {
      const c = cityData[k];
      const dates = c.bts_dates ? JSON.parse(c.bts_dates)[0] : '';
      return `<button class="city-tab" data-city="${k}" onclick="selectCity('${k}')">${escHtml(c.name)}<span class="date">${dates}</span></button>`;
    }).join('')}
  </div>
</header>
<main>
  <div class="summary-bar" id="summary-bar"></div>
  <div id="map-wrap">
    <div id="map"></div>
    <div class="legend">
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.bts_venue}"></span>⭐ 공연장</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.heritage}"></span>🏛️ 역사</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.hotspot}"></span>✨ 명소</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.attraction}"></span>🗿 관광</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.adventure}"></span>⛰️ 액티비티</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.healing}"></span>🌿 자연</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.shopping}"></span>🛍️ 쇼핑</span>
      <span class="legend-item"><span class="legend-dot" style="background:${CAT_COLOR.restaurant}"></span>🍽️ 식당</span>
    </div>
  </div>
  <div id="sections"></div>
</main>
<div id="modal" class="modal" onclick="closeModal()">
  <span class="modal-close">×</span><img id="modal-img" /><div class="name" id="modal-name"></div>
</div>

<script>
const ALL_CITIES = ${JSON.stringify(cityData)};
const COLORS = ${JSON.stringify(CAT_COLOR)};
const EMOJIS = ${JSON.stringify(CAT_EMOJI)};
const LUCIDE = ${JSON.stringify(LUCIDE_PATHS_FOR_HTML)};
const CAT_LABEL = { heritage: '🏛️ Heritage', hotspot: '✨ Hotspot', attraction: '🗿 Attraction', adventure: '⛰️ Adventure', healing: '🌿 Healing', shopping: '🛍️ Shopping', restaurant: '🍽️ Restaurant' };
const BTS_MAP_STYLE = ${JSON.stringify([
  { elementType: "geometry", stylers: [{ color: "#f8f7fb" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#e9e6f0" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#9333ea", weight: 1 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9d5ff" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcfce7" }] },
])};

let map, currentCity, markers = {}, venueMarker;
const selectedIds = new Set();

function makeIcon(cat, isVenue) {
  const color = COLORS[cat] || '#666';
  const path = LUCIDE[cat] || '<circle cx="12" cy="12" r="6"/>';
  const size = isVenue ? 56 : 40;
  const iconSize = isVenue ? 28 : 20;
  const off = (size - iconSize) / 2;
  const sc = iconSize / 24;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + (size/2-2) + '" fill="' + color + '" stroke="white" stroke-width="3"/><g transform="translate(' + off + ',' + off + ') scale(' + sc + ')" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</g></svg>';
  return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(size, size), anchor: new google.maps.Point(size/2, size/2) };
}

function selectCity(key) {
  currentCity = ALL_CITIES[key];
  document.querySelectorAll('.city-tab').forEach(t => t.classList.toggle('active', t.dataset.city === key));
  selectedIds.clear();
  Object.values(markers).forEach(m => m.setMap(null));
  markers = {};
  if (venueMarker) venueMarker.setMap(null);

  // 통계 갱신
  const total = currentCity.places.length;
  const withImg = currentCity.places.filter(p => p.image_url).length;
  const core = currentCity.places.filter(p => p.day_zone === 'core').length;
  const outskirt = currentCity.places.filter(p => p.day_zone === 'outskirt').length;
  document.getElementById('summary-bar').innerHTML = '<span class="pill">📋 ' + total + ' 곳</span><span class="pill">🖼️ ' + withImg + '/' + total + '</span><span class="pill">🌍 core ' + core + ' / outskirt ' + outskirt + '</span>';

  // 지도 + venue
  if (map) {
    map.setCenter({ lat: currentCity.center.lat, lng: currentCity.center.lng });
    map.setZoom(11);
    venueMarker = new google.maps.Marker({ position: { lat: currentCity.venue.lat, lng: currentCity.venue.lng }, map, icon: makeIcon('bts_venue', true), zIndex: 999, title: currentCity.venue.name });
    venueMarker.addListener('click', () => openModal(currentCity.venue.img, currentCity.venue.name));
  }

  // 카드 그리드 (카테고리별)
  const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant'];
  let html = '';
  for (const cat of cats) {
    const list = currentCity.places.filter(p => p.cat === cat);
    if (!list.length) continue;
    const wImg = list.filter(p => p.image_url).length;
    const cards = list.map(p => {
      const img = p.image_url;
      const color = COLORS[p.cat];
      const emoji = EMOJIS[p.cat];
      const day = (p.day_zone || '').toUpperCase();
      const src = p.image_url ? (p.image_url.includes('upload.wikimedia') ? 'wikipedia' : (p.image_url.includes('supabase') ? 'google_photo' : 'none')) : 'none';
      const summary_en = p.summary_en || '';
      const summary_ko = p.summary_ko || '';
      return '<div class="card" id="card-p' + p.id + '" onclick="toggleCard(' + p.id + ')">' +
        '<div class="card-img-wrap">' +
        (img ? '<img src="' + img + '" loading="lazy" />' : '<div class="img-missing">❌ 이미지 X</div>') +
        '<div class="rank-badge" style="background:' + color + '">' + emoji + ' #' + p.rank + '</div>' +
        '<div class="src-badge ' + src + '">' + src.toUpperCase() + '</div>' +
        '</div>' +
        '<div class="card-body">' +
        '<div class="name-en">' + (p.name_en || '') + '</div>' +
        (p.name_ko ? '<div class="name-ko">' + p.name_ko + '</div>' : '') +
        '<div class="address">' + (p.address || '') + '</div>' +
        '<div class="meta"><span class="dist">' + (p.distance_km_from_center || 0) + 'km</span><span class="day ' + p.day_zone + '">' + day + '</span><span class="rc">rc ' + (p.google_review_count || 0).toLocaleString() + '</span></div>' +
        (summary_en ? '<div class="summary"><b>EN:</b> ' + summary_en + '</div>' : '') +
        (summary_ko ? '<div class="summary"><b>KO:</b> ' + summary_ko + '</div>' : '') +
        '</div></div>';
    }).join('');
    html += '<div class="cat-section"><div class="cat-header" style="border-left:4px solid ' + COLORS[cat] + '"><span>' + (CAT_LABEL[cat] || cat) + ' — ' + list.length + ' 곳</span><span style="font-size:11px;color:#666;background:#fff8e1;padding:2px 8px;border-radius:10px">이미지 ' + wImg + '/' + list.length + '</span></div><div class="grid">' + cards + '</div></div>';
  }
  document.getElementById('sections').innerHTML = html;
}

function toggleCard(id) {
  const place = currentCity.places.find(p => p.id === id);
  if (!place) return;
  const card = document.getElementById('card-p' + id);
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    if (markers[id]) { markers[id].setMap(null); delete markers[id]; }
    card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    const m = new google.maps.Marker({ position: { lat: place.lat, lng: place.lng }, map, icon: makeIcon(place.cat, false), title: place.name_en });
    m.addListener('click', () => openModal(place.image_url, place.name_en + (place.name_ko ? ' / ' + place.name_ko : '')));
    markers[id] = m;
    card.classList.add('selected');
  }
  fitBounds();
}

function fitBounds() {
  const b = new google.maps.LatLngBounds();
  b.extend({ lat: currentCity.venue.lat, lng: currentCity.venue.lng });
  for (const m of Object.values(markers)) b.extend(m.getPosition());
  if (Object.keys(markers).length === 0) {
    map.setCenter({ lat: currentCity.center.lat, lng: currentCity.center.lng }); map.setZoom(11);
  } else { map.fitBounds(b, { top: 60, right: 60, bottom: 60, left: 60 }); }
}

function openModal(imgUrl, name) {
  if (!imgUrl) return;
  document.getElementById('modal-img').src = imgUrl;
  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), { center: { lat: ALL_CITIES['${defaultKey}'].center.lat, lng: ALL_CITIES['${defaultKey}'].center.lng }, zoom: 11, styles: BTS_MAP_STYLE, disableDefaultUI: true, zoomControl: true });
  selectCity('${defaultKey}');
}
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&callback=initMap"></script>
</body></html>`;

fs.writeFileSync('docs/qa/index.html', indexHtml);
console.log('  saved: docs/qa/index.html (' + cityKeys.length + ' 도시 통합)');
console.log('  열기: file:///' + process.cwd().replace(/\\/g, '/') + '/docs/qa/index.html');

await c.end();
console.log('\n═══ 완료 ═══');

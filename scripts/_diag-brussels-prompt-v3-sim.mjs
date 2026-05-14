// scripts/_diag-brussels-prompt-v3-sim.mjs
// 1 회용 진단 = 신규 도시 프롬프트 v3 시뮬 (= 브뤼셀)
// = 사용자 SSOT 모델 = gemini-3.1-flash-lite-latest (= 안 되면 폴백 시도)
// = 한국 여행객 + selection_reason_ko/shortform_ko 분리 + 6 카테고리 유지
// = DB 쓰기 X = raw 응답만 저장 + 표 출력

import fs from 'fs';
import pg from 'pg';

// .env 로드
const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// API key
const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const GEMINI_KEY = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0].key_value;
await c.end();

// 브뤼셀 SSOT
const CITY = { id: 41, name_en: 'Brussels', country: 'Belgium', lat: 50.8503, lng: 4.3517 };
const PROMPT = `You are a travel data assistant for KOREAN TRAVELERS.
Return STRICT machine-parseable JSON only.

CITY: ${CITY.name_en}
COUNTRY: ${CITY.country}
CITY_CENTER: { lat: ${CITY.lat}, lng: ${CITY.lng} }
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

For each of the 6 categories below, return TOP 20 most famous places
ordered by KOREAN TRAVELERS' popularity (= 인스타 성지, 한국 블로그 빈도,
유튜브 vlog 등장 빈도 우선 = NOT Western tourist ranking).

Categories:
1. heritage    — historical sites and museums
2. hotspot     — photogenic viewpoints, panoramic photo spots
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
- selection_reason_ko (한국어 한 줄 = 한국 여행객 사이 트렌드 = 인스타 성지/최근 핫한 지역/한국 vlog 노출 빈도 등 사회적 검증 근거)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 있는 설명 = 감성/재미 후킹 카피 = Claude 톤. 단순 정보 X, 짧고 강하게)
- distance_km_from_center (haversine from CITY_CENTER, 1 decimal)
- day_zone: "core" if <=10km OR "outskirt" if 10<d<=100km

OUTPUT (strict JSON, no markdown fences):
{
  "city": "${CITY.name_en}",
  "country": "${CITY.country}",
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

// 모델 시도 순서 (= 사용자 SSOT 우선, 실패 시 폴백)
const MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite-latest',  // 사용자 SSOT 1순위
  'gemini-3-flash-lite-preview',   // 폴백 1
  'gemini-3-flash-lite',           // 폴백 2
  'gemini-3-flash-preview',        // 폴백 3 (= 현재 seed-gemini.mjs)
  'gemini-2.5-flash',              // 폴백 4 (= ag2-gemini-recommender 현재)
];

async function tryModel(model) {
  console.log(`\n[모델 시도] ${model} ...`);
  const t0 = Date.now();
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 50000, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(420000),
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const respJson = await resp.json();
    if (respJson.error) {
      console.log(`  ❌ ${model} = ${respJson.error.code} ${respJson.error.message?.slice(0, 100)}`);
      return { ok: false, model, error: respJson.error };
    }
    const usage = respJson.usageMetadata || {};
    const cost = (usage.promptTokenCount * 0.075 / 1e6) + (usage.candidatesTokenCount * 0.30 / 1e6);
    console.log(`  ✅ ${model} = ${elapsed}s, ${usage.totalTokenCount} tokens, $${cost.toFixed(4)}`);
    return { ok: true, model, resp: respJson, elapsed, cost };
  } catch (e) {
    console.log(`  ❌ ${model} = ${e.message}`);
    return { ok: false, model, error: { message: e.message } };
  }
}

let result = null;
for (const model of MODEL_CANDIDATES) {
  result = await tryModel(model);
  if (result.ok) break;
}

if (!result?.ok) {
  console.error('\n❌ 모든 모델 실패');
  process.exit(1);
}

const text = result.resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
const RAW_PATH = 'docs/raw/brussels-v3-sim.json';
const RAW_TXT = 'docs/raw/brussels-v3-sim.raw.txt';
fs.mkdirSync('docs/raw', { recursive: true });
fs.writeFileSync(RAW_TXT, text);

// JSON 파싱
const jsonStart = text.indexOf('{');
let parsed = null;
if (jsonStart >= 0) {
  const candidate = text.slice(jsonStart, text.lastIndexOf('}') + 1);
  try { parsed = JSON.parse(candidate); } catch (e) {
    // 잘림 복구
    for (let endIdx = text.length - 1; endIdx > jsonStart; endIdx--) {
      if (text[endIdx] !== '}') continue;
      const trimmed = text.slice(jsonStart, endIdx + 1);
      for (const suffix of [']}}', ']}', '}', '']) {
        try {
          const p = JSON.parse(trimmed + suffix);
          if (p.results) { parsed = p; break; }
        } catch (e) {}
      }
      if (parsed) break;
    }
  }
}

if (!parsed) {
  console.error('❌ JSON 파싱 실패. raw: ' + RAW_TXT);
  process.exit(1);
}

fs.writeFileSync(RAW_PATH, JSON.stringify(parsed, null, 2));
console.log(`\n✅ 저장: ${RAW_PATH} (= 사용 모델 = ${result.model})`);

// 표 출력 = 카테고리별 카운트 + 샘플 3 곳
console.log('\n═══ 카테고리별 응답 ═══');
const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];
for (const cat of cats) {
  const list = parsed.results?.[cat] || [];
  console.log(`\n[${cat}] = ${list.length} 곳`);
  for (let i = 0; i < Math.min(3, list.length); i++) {
    const p = list[i];
    console.log(`  ${p.rank}. ${p.name_en} (${p.name_ko})`);
    console.log(`     주소: ${p.address}`);
    console.log(`     선정이유: ${p.selection_reason_ko}`);
    console.log(`     후킹카피: ${p.shortform_ko}`);
    console.log(`     좌표: ${p.lat}, ${p.lng} | ${p.distance_km_from_center}km | ${p.day_zone}`);
  }
}

const totalCount = cats.reduce((s, c) => s + (parsed.results?.[c]?.length || 0), 0);
console.log(`\n총 ${totalCount} 곳 응답. 사용 모델 = ${result.model}, 토큰 = ${result.resp.usageMetadata?.totalTokenCount}, 비용 = $${result.cost?.toFixed(4)}`);

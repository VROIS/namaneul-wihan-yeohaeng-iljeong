// 1 회용 = 메인앱 v3 prompt 최종 확정 = Paris 시뮬
// = 사용자 SSOT 2026-05-14 = gemini-3-flash-preview + grounding
// = 시드 v3 + AG1 보강 + 슬롯 매트릭스 + 동선 정렬 + 9 필드 (= rank 제거)
// = 결과: docs/raw/mainapp-paris-v3.json

import fs from 'fs';
import pg from 'pg';

const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const GEMINI_KEY = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0].key_value;
await c.end();

// ═══ Paris 입력 + AG1 슬롯 매트릭스 (= 하드코드 시뮬) ═══
const INPUT = {
  destination: 'Paris',
  country: 'France',
  lat: 48.8566,
  lng: 2.3522,
  dayCount: 3,
  companionType: 'Couple',
  headcount: 2,
  vibes: ['Hotspot', 'Culture', 'Healing'],
  pace: 'Normal',
  style: 'Reasonable',
};

const SLOT_MATRIX = {
  day1: { hotspot: 2, heritage: 1, healing: 1, lunch: 1, dinner: 1 },
  day2: { hotspot: 1, heritage: 2, healing: 1, lunch: 1, dinner: 1 },
  day3: { hotspot: 2, heritage: 1, healing: 1, lunch: 1, dinner: 1 },
};
const slotMatrixText = Object.entries(SLOT_MATRIX)
  .map(([d, s]) => `${d.toUpperCase()}: ${Object.entries(s).map(([k, v]) => `${k} ${v}`).join(' + ')} = ${Object.values(s).reduce((a, b) => a + b, 0)} slots`)
  .join('\n');

const koreanTravelerStyle = `${INPUT.companionType} ${INPUT.headcount}명 / vibe=${INPUT.vibes.join('+')} / 페이스=${INPUT.pace} / 스타일=${INPUT.style}`;

// ═══ 메인앱 v3 prompt = 사용자 SSOT 최종 확정 (= rank 제거 = 9 필드) ═══
const PROMPT = `You are a travel data assistant for KOREAN TRAVELERS.
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

CITY: ${INPUT.destination}
COUNTRY: ${INPUT.country}
CITY_CENTER: { lat: ${INPUT.lat}, lng: ${INPUT.lng} }
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

[USER CONTEXT — AG1 보강]
${koreanTravelerStyle}

[SLOT MATRIX — AG1 결정]
${slotMatrixText}

Return places ordered by KOREAN TRAVELERS' popularity (= 인스타 성지, 한국 블로그 빈도,
유튜브 vlog 등장 빈도 우선 = NOT Western tourist ranking).
Group by day with route-aware sequencing (= 같은 날 = 같은 구역 묶기, 도심 출발/귀환).
Array order within each day = visit order.

For each place include:
- name_en (English official name)
- name_local (local language name, if different — for TS matching)
- name_ko (Korean name commonly used by Korean travelers)
- lat, lng (decimal degrees)
- address (FULL street address with NUMBER + street + postal code + city)
- selection_reason_ko (한국어 한 줄 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증)
- shortform_ko (한국어 한 줄 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X)
- distance_km_from_center (haversine, 1 decimal)
- day_zone: "core" if <=10km OR "outskirt" if 10<d<=100km

OUTPUT (strict JSON, no markdown fences):
{
  "city": "${INPUT.destination}",
  "country": "${INPUT.country}",
  "center": { "lat": ${INPUT.lat}, "lng": ${INPUT.lng} },
  "radius_km": 100,
  "days": [
    { "day": 1, "places": [ ... ] },
    { "day": 2, "places": [ ... ] },
    { "day": 3, "places": [ ... ] }
  ]
}`;

console.log('═══ 입력 ═══');
console.log(`도시: ${INPUT.destination} / ${INPUT.dayCount}일 / ${INPUT.vibes.join('+')}`);
console.log(`슬롯 매트릭스:\n${slotMatrixText}`);
console.log(`프롬프트 길이: ${PROMPT.length}자`);
console.log(`\n═══ 호출 = gemini-3-flash-preview + googleSearch grounding ═══`);

const t0 = Date.now();
const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
  }),
  signal: AbortSignal.timeout(300000),
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const respJson = await resp.json();

if (respJson.error) {
  console.error(`❌ ${respJson.error.code} ${respJson.error.message}`);
  process.exit(1);
}

const usage = respJson.usageMetadata || {};
const cost = (usage.promptTokenCount * 0.075 / 1e6) + (usage.candidatesTokenCount * 0.30 / 1e6);
const text = respJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
const finishReason = respJson.candidates?.[0]?.finishReason || 'unknown';

console.log(`\n✅ ${elapsed}초 / ${usage.totalTokenCount} 토큰 / $${cost.toFixed(4)} / finish=${finishReason}`);

// 파싱
let parsed = null;
const jsonStart = text.indexOf('{');
if (jsonStart >= 0) {
  const candidate = text.slice(jsonStart, text.lastIndexOf('}') + 1);
  try { parsed = JSON.parse(candidate); } catch (e) {
    for (let endIdx = text.length - 1; endIdx > jsonStart; endIdx--) {
      if (text[endIdx] !== '}') continue;
      const trimmed = text.slice(jsonStart, endIdx + 1);
      for (const suffix of [']}}', ']}', '}', '']) {
        try {
          const p = JSON.parse(trimmed + suffix);
          if (p.days) { parsed = p; break; }
        } catch (e) {}
      }
      if (parsed) break;
    }
  }
}

if (!parsed) {
  console.error('❌ JSON 파싱 실패');
  fs.writeFileSync('docs/raw/mainapp-paris-v3.raw.txt', text);
  process.exit(1);
}

fs.mkdirSync('docs/raw', { recursive: true });
fs.writeFileSync('docs/raw/mainapp-paris-v3.json', JSON.stringify({ meta: { model: 'gemini-3-flash-preview', elapsed, usage, cost }, raw_text: text, parsed }, null, 2));
console.log(`💾 저장: docs/raw/mainapp-paris-v3.json`);

// 요약
const totalPlaces = parsed.days.reduce((s, d) => s + (d.places?.length || 0), 0);
console.log(`\n총 ${parsed.days.length} 일 / ${totalPlaces} 곳`);

for (const day of parsed.days) {
  console.log(`\n[Day ${day.day}] = ${day.places.length} 곳`);
  for (const p of day.places.slice(0, 6)) {
    console.log(`  • ${p.name_en} (${p.name_ko})`);
    console.log(`    주소: ${p.address}`);
    console.log(`    선정: ${p.selection_reason_ko}`);
    console.log(`    후킹: ${p.shortform_ko}`);
  }
}

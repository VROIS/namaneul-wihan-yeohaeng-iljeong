// 1 회용 = 식당 시드 발굴 = 2 회 호출 (30 LOW + 20 MID/HIGH) = JSON 저장 = INSERT X
// 사용자 명시 = 검토 후 INSERT 결정
import fs from 'fs';

async function main() {
  const raw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
  }
  if (!process.env.DATABASE_URL && process.env.SUPA_URL) process.env.DATABASE_URL = process.env.SUPA_URL;

  // Gemini API key = DB에서 로드 (= 시드 패턴)
  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  await c.end();
  const GEMINI_KEY = keyRow.key_value;

  // Paris 정보
  const CITY_NAME = 'Paris';
  const COUNTRY = 'France';
  const CITY_LAT = 48.8566;
  const CITY_LNG = 2.3522;
  const nowYear = new Date().getFullYear();

  const buildPrompt = (tierSpec: string, outputSpec: string) => `You are a travel data assistant for KOREAN TRAVELERS (${nowYear}년 기준 최신 정보).
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

CITY: ${CITY_NAME}
COUNTRY: ${COUNTRY}
CITY_CENTER: { lat: ${CITY_LAT}, lng: ${CITY_LNG} }
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

Return restaurants within 100 km of CITY_CENTER (= 도심 + 외곽 day-trip 포함), classified by 1인당 평균 가격 (relative to this city's local dining standards):
${tierSpec}

Order WITHIN each tier by KOREAN TRAVELERS' popularity (= 인스타 성지, 네이버 블로그 노출, 유튜브 vlog 등장, 한국인 필수 코스 우선 = NOT Western tourist ranking).

For each place include only:
- price_tier ("low" | "mid" | "high")
- rank (1-N within tier)
- name_en (English official name on Google Maps)
- name_local (local language name, if different — for TS matching)
- name_ko (한국 여행자가 부르는 이름)
- address (FULL street address with NUMBER + street + postal code + city = 제 2 중복 매칭 키)
- price_eur_max (1인당 평균 EUR, 상한가. 확실하지 않으면 null)
- distance_km_from_center (haversine from CITY_CENTER, 1 decimal)
- day_zone: "core" if distance_km_from_center <= 10 OR "outskirt" if 10 < distance_km_from_center <= 100
- selection_reason_ko (한국어 한 줄 = 인스타 성지/네이버 블로그/유튜브 vlog 등 사회적 검증 = 권위/신뢰성. → DB summary_ko)
- shortform_ko (한국어 한 줄 = 코믹/위트 후킹 카피 = Claude 톤. "프사각", "본전 뽑음", "물가에 이 가격?" 같은 한국 슬랭/감성. → DB editorial_summary)

(Note: place_id / lat / lng / review_count / types / primary_type are NOT requested — obtained via Google Places searchText next step. LLM-curated fields only.)

OUTPUT (strict JSON, no markdown fences):
${outputSpec}`;

  async function callGemini(prompt: string, label: string) {
    console.log(`\n═══ Gemini 호출 = ${label} (= ${prompt.length}자) ═══`);
    const t0 = Date.now();
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 50000, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(420000),
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const j = await resp.json();
    if (j.error) { console.error(`❌ ${label}: ${j.error.message}`); return null; }
    const usage = j.usageMetadata || {};
    const cost = (usage.promptTokenCount * 0.075 / 1e6) + (usage.candidatesTokenCount * 0.30 / 1e6);
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`✅ ${elapsed}초 / ${usage.totalTokenCount} 토큰 / $${cost.toFixed(4)} / ${text.length}자`);
    return { text, elapsed, cost, tokens: usage.totalTokenCount };
  }

  // 호출 1 = 30 LOW
  const r1 = await callGemini(
    buildPrompt(
      `  - 30 LOW`,
      `{ "results": { "low": [...30] } }`,
    ),
    '30 LOW',
  );
  if (!r1) process.exit(1);

  // 호출 2 = 15 MID + 5 HIGH
  const r2 = await callGemini(
    buildPrompt(
      `  - 15 MID\n  - 5 HIGH`,
      `{ "results": { "mid": [...15], "high": [...5] } }`,
    ),
    '15 MID + 5 HIGH',
  );
  if (!r2) process.exit(1);

  // 파싱
  function parse(text: string) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    const candidate = text.slice(start, text.lastIndexOf('}') + 1);
    try { return JSON.parse(candidate); } catch (e) {}
    // 잘림 복구
    for (let endIdx = text.length - 1; endIdx > start; endIdx--) {
      if (text[endIdx] !== '}') continue;
      const trimmed = text.slice(start, endIdx + 1);
      for (const suffix of [']}}', ']}', '}', '']) {
        try { const p = JSON.parse(trimmed + suffix); if (p.results) return p; } catch (e) {}
      }
    }
    return null;
  }

  const p1 = parse(r1.text);
  const p2 = parse(r2.text);

  // 저장
  fs.mkdirSync('docs/raw', { recursive: true });
  fs.writeFileSync('docs/raw/paris_restaurant_low.json', JSON.stringify({ meta: r1, raw: r1.text, parsed: p1 }, null, 2));
  fs.writeFileSync('docs/raw/paris_restaurant_mid_high.json', JSON.stringify({ meta: r2, raw: r2.text, parsed: p2 }, null, 2));

  // 요약
  const low = p1?.results?.low || [];
  const mid = p2?.results?.mid || [];
  const high = p2?.results?.high || [];
  console.log(`\n═══ 요약 ═══`);
  console.log(`LOW:  ${low.length} 곳`);
  console.log(`MID:  ${mid.length} 곳`);
  console.log(`HIGH: ${high.length} 곳`);
  console.log(`합계: ${low.length + mid.length + high.length} 곳`);
  console.log(`총 비용: $${(r1.cost + r2.cost).toFixed(4)}`);
  console.log(`총 소요: ${(parseFloat(r1.elapsed) + parseFloat(r2.elapsed)).toFixed(1)}초`);

  console.log(`\n═══ 샘플 표시 = LOW 상위 3 ═══`);
  for (const p of low.slice(0, 3)) {
    console.log(`  ${p.rank}. ${p.name_en} (${p.name_ko}) [${p.name_local || ''}]`);
    console.log(`     addr: ${p.address}`);
    console.log(`     €${p.price_eur_max} / ${p.distance_km_from_center}km / ${p.day_zone}`);
    console.log(`     FOMO:  ${p.selection_reason_ko}`);
    console.log(`     위트:  ${p.shortform_ko}`);
  }
  console.log(`\n═══ 샘플 = MID 상위 3 ═══`);
  for (const p of mid.slice(0, 3)) {
    console.log(`  ${p.rank}. ${p.name_en} (${p.name_ko})`);
    console.log(`     €${p.price_eur_max} / ${p.day_zone}`);
    console.log(`     FOMO:  ${p.selection_reason_ko}`);
    console.log(`     위트:  ${p.shortform_ko}`);
  }
  console.log(`\n═══ 샘플 = HIGH 상위 3 ═══`);
  for (const p of high.slice(0, 3)) {
    console.log(`  ${p.rank}. ${p.name_en} (${p.name_ko})`);
    console.log(`     €${p.price_eur_max} / ${p.day_zone}`);
    console.log(`     FOMO:  ${p.selection_reason_ko}`);
    console.log(`     위트:  ${p.shortform_ko}`);
  }

  console.log(`\n💾 저장 = docs/raw/paris_restaurant_low.json + paris_restaurant_mid_high.json`);
  console.log(`⏸️ DB INSERT = X (= 사용자님 검토 후 결정)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

// ⚠️ 수정금지(승인필요) 2026-05-18 = Step 10 = 외곽 식당 시드 발굴 + INSERT
// = 호출 = npx tsx 10-outskirt-seed-insert.ts --city=Paris --hints="Versailles, Disneyland Paris, ..." [--apply]
// = 1 단계 = Gemini 2 호출 = 30 LOW + 30 MID outskirt only (= prompts/outskirt-restaurant.txt 사용)
// = 응답 저장 = tmp/<city>-restaurant-outskirt.json (= 사용자 검수)
// = --apply 시 = upsertPlace() 60 회 호출 = 새 정책 (= 주소+이름 동시 매칭)

import 'dotenv/config';
import fs from 'fs';
import { loadApiKeysFromDb } from '../../../../server/services/shared/api-keys-loader';
import { upsertPlace } from '../../../../server/services/place-upsert';
import { db } from '../../../../server/db';

interface CliArgs { city: string; hints: string; apply: boolean; }
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: '', hints: '', apply: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--city=')) args.city = a.slice(7);
    else if (a.startsWith('--hints=')) args.hints = a.slice(8);
    else if (a === '--apply') args.apply = true;
  }
  if (!args.city) throw new Error('--city=<name> 명시 필요');
  return args;
}

async function findCity(cityName: string): Promise<{ id: number; lat: number; lng: number }> {
  const r: any = await (db as any).execute(
    `SELECT id, latitude, longitude FROM cities WHERE LOWER(name) = LOWER('${cityName.replace(/'/g, "''")}') LIMIT 1`,
  );
  const row = r?.rows?.[0] || r?.[0];
  if (!row) throw new Error(`city '${cityName}' 미발견`);
  return { id: Number(row.id), lat: Number(row.latitude), lng: Number(row.longitude) };
}

function buildPrompt(city: { name: string; country: string; lat: number; lng: number }, tier: string, hints: string, exclude: string): string {
  const year = new Date().getFullYear();
  const tierSpec = tier === 'low'
    ? '  - 30 LOW (= 1인당 평균 ~30 EUR 이하 = 저렴 = 동네 brasserie/카페/베이커리/스트리트푸드)'
    : '  - 30 MID (= 1인당 평균 30-80 EUR = 합리적 = 미슐랭 빕구르망/Auberge/지역 특산/seafood)';
  const outputSpec = tier === 'low'
    ? '{ "results": { "low": [ ...30 outskirt items ] } }'
    : '{ "results": { "mid": [ ...30 outskirt items ] } }';
  return `You are a travel data assistant for KOREAN TRAVELERS (${year}년 기준 최신 정보).
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

⚠️ 응답 근거 = **Google Search 그라운딩 기반** = 최신/검증된 사실 (= 한국 인스타/블로그/유튜브 트렌드, 한국인 visit 빈도, 미슐랭 평가) 만 사용 = 추정/환각 금지.

CITY: ${city.name}
COUNTRY: ${city.country}
CITY_CENTER: { lat: ${city.lat}, lng: ${city.lng} }
TARGET_AUDIENCE: Korean travelers

⚠️ 핵심 조건:
1. distance_km_from_center > 10 AND <= 100 (= OUTSKIRT ONLY = 도심 10km 이내 제외)
2. 한국인 day-trip 명소 우선 (= ${hints})
3. 이미 알려진 도심 식당과 중복 X = 외곽 신규 발굴만${exclude}

Return ${tier === 'low' ? '30 LOW' : '30 MID'} restaurants in OUTSKIRT (= 10-100km from CITY_CENTER):
${tierSpec}

Order by KOREAN TRAVELERS' popularity (= 인스타 성지, 네이버 블로그 노출, 유튜브 vlog 등장, 한국인 필수 코스 우선).

For each place include only:
- price_tier ("low" or "mid")
- rank (1-30)
- name_en (English official name on Google Maps)
- name_local (local language name, if different)
- name_ko (한국 여행자가 부르는 이름)
- address (FULL: 번지 + 거리 + 우편번호 + 도시 + 국가)
- price_eur_max (1인당 평균 EUR, 상한가)
- distance_km_from_center (haversine, 1 decimal, > 10)
- day_zone: "outskirt"
- selection_reason_ko (한국어 한 줄 → DB summary_ko)
- shortform_ko (한국어 한 줄 → DB editorial_summary)

OUTPUT (strict JSON, no markdown fences):
${outputSpec}`;
}

async function callGemini(prompt: string, label: string, geminiKey: string) {
  console.log(`\n--- Gemini ${label} (= ${prompt.length}자) ---`);
  const t0 = Date.now();
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 50000, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(420000),
  });
  const j: any = await resp.json();
  if (j.error) { console.error(`❌ ${label}: ${j.error.message}`); return null; }
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const finishReason = j.candidates?.[0]?.finishReason || 'unknown';
  console.log(`✅ ${elapsed}초 / finishReason=${finishReason} / ${text.length}자`);
  return { text, elapsed, finishReason };
}

function parse(text: string): any | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  const candidate = text.slice(start, text.lastIndexOf('}') + 1);
  try { return JSON.parse(candidate); } catch (e) {}
  for (let endIdx = text.length - 1; endIdx > start; endIdx--) {
    if (text[endIdx] !== '}') continue;
    const trimmed = text.slice(start, endIdx + 1);
    for (const suffix of [']}}', ']}', '}', '']) {
      try { const p = JSON.parse(trimmed + suffix); if (p.results) return p; } catch (e) {}
    }
  }
  return null;
}

(async () => {
  await loadApiKeysFromDb();
  const args = parseArgs(process.argv);
  const city = await findCity(args.city);
  const cityName = args.city;
  console.log(`=== Step 10 = ${cityName} 외곽 식당 시드 (cityId=${city.id}) ===`);
  const today = new Date().toISOString().slice(0, 10);
  const phaseTag = `outskirt-restaurant-${today}`;

  // 1. Gemini 호출 (= dry-run or apply 동일)
  const geminiKey = process.env.GEMINI_API_KEY!;
  const promptLow = buildPrompt({ name: cityName, country: 'France' /* TODO: country 자동 추출 */, lat: city.lat, lng: city.lng }, 'low', args.hints, '');
  const r1 = await callGemini(promptLow, '30 LOW', geminiKey);
  if (!r1) process.exit(1);
  const p1 = parse(r1.text);
  const low = p1?.results?.low || [];

  const excludeList = low.length > 0
    ? `\n\n⚠️ 이미 추천된 LOW 30 곳 (= 아래) 와 중복 X:\n${low.map((p: any) => `  - ${p.name_en} (${p.address || ''})`).join('\n')}`
    : '';
  const promptMid = buildPrompt({ name: cityName, country: 'France', lat: city.lat, lng: city.lng }, 'mid', args.hints, excludeList);
  const r2 = await callGemini(promptMid, '30 MID', geminiKey);
  if (!r2) process.exit(1);
  const p2 = parse(r2.text);
  const mid = p2?.results?.mid || [];

  // 2. 저장
  fs.mkdirSync('tmp', { recursive: true });
  const outFile = `tmp/${cityName.toLowerCase()}-restaurant-outskirt.json`;
  fs.writeFileSync(outFile, JSON.stringify({
    meta: { cityName, cityId: city.id, today, lowCount: low.length, midCount: mid.length },
    rawCall1: r1.text, rawCall2: r2.text,
    parsedLow: low, parsedMid: mid,
  }, null, 2));
  console.log(`\n💾 저장 = ${outFile}`);
  console.log(`LOW = ${low.length} / MID = ${mid.length} = 합 ${low.length + mid.length}`);

  if (!args.apply) {
    console.log(`\n⏸️ DB INSERT = X (= --apply 추가 시 = 진행)`);
    process.exit(0);
  }

  // 3. INSERT = upsertPlace
  console.log(`\n=== INSERT 진행 (= upsertPlace = 새 정책) ===`);
  const all = [...low, ...mid];
  let inserted = 0, updated = 0, skipped = 0;
  for (const p of all) {
    try {
      const r = await upsertPlace({
        cityId: city.id,
        seedCategory: 'restaurant',
        collectionPhase: phaseTag,
        nameEn: p.name_en,
        nameLocal: p.name_local || null,
        nameKo: p.name_ko || null,
        address: p.address || null,
        priceEur: p.price_eur_max != null ? Number(p.price_eur_max) : null,
        selectionReasonKo: p.selection_reason_ko || null,
        shortformKo: p.shortform_ko || null,
        dayZone: 'outskirt',
        distanceKmFromCenter: p.distance_km_from_center != null ? Number(p.distance_km_from_center) : null,
        phaseTags: [phaseTag],
      });
      if (r.action === 'inserted') inserted++;
      else if (r.action === 'updated') updated++;
      else skipped++;
    } catch (e: any) {
      console.error(`  ⛔ ${p.name_en}: ${e.message}`);
    }
  }
  console.log(`inserted=${inserted} updated=${updated} skipped=${skipped}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

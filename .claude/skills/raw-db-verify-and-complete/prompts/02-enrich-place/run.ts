// ⚠️ 수정금지(승인필요) 2026-05-20 = 02-enrich-place 실행 진입점 (= 01/03/04/05 패턴 = 자립 batch loop)
// = 활성 행 SELECT id ASC → batch 40 → Gemini 호출 → docs/raw/{city_id}/02-enrich-batch-{offset}-{date}.json 저장
// = adaptive fallback (= 40 → 30 → 20 → 10) 응답 실패 시
// = enrich-place.ts 의 enrichPlaceByGemini() 시그니처와 무관 (= 본 run.ts = 독립 호출)
//
// 호출:
//   npx tsx .../02-enrich-place/run.ts --city-id=19 [--batch=40] [--offset=0] [--limit=N]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const batchSize = Number(argv['batch'] || 40);
const startOffset = Number(argv['offset'] || 0);
const limit = Number(argv['limit'] || 0);
// ⚠️ 수정금지(승인필요) 2026-06-04 = 결함 전용 모드 = 비식당 6카테고리 + 4요소(name_ko/summary_ko/editorial_summary/price) 중 1개라도 결함난 행만 (= 사용자 SSOT). 미지정 = 기존 전 행.
const defectsOnly = argv['defects-only'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> [--batch=40] [--offset=0] [--limit=N] [--defects-only]'); process.exit(1); }

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  if (!city || !keyRow?.key_value) { await c.end(); console.error('city/Gemini key 미존재'); process.exit(1); }
  const GEMINI_KEY = keyRow.key_value;

  // 활성 행 SELECT id ASC
  // ⚠️ 2026-06-04 = defects-only = 비식당 6카테고리 + 4요소 결함만 (식당=13-restaurant-summary 별도 / shopping 가격결함 제외=입장료 없음)
  const defectWhere = `AND seed_category IN ('heritage','hotspot','attraction','adventure','healing','shopping')
      AND ( name_ko IS NULL OR name_ko='' OR summary_ko IS NULL OR summary_ko=''
         OR editorial_summary IS NULL OR editorial_summary='' OR (price_eur IS NULL AND seed_category <> 'shopping') )`;
  const rows = (await c.query(`
    SELECT id, name_en, name_local, name_ko, address, latitude, longitude, google_place_id, seed_category
    FROM place_seed_raw
    WHERE city_id = $1 ${defectsOnly ? defectWhere : ''}
    ORDER BY id
  `, [cityId])).rows;
  await c.end();

  const slice = limit ? rows.slice(startOffset, startOffset + limit) : rows.slice(startOffset);
  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 02-enrich-place ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), 활성 = ${rows.length}, offset = ${startOffset}, 처리 = ${slice.length}, batch = ${batchSize}`);

  const promptTpl = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')
    .split(/═{30,}/)[2] || '';

  async function callGemini(prompt: string) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 50000,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(420000),
      }
    );
    const j = await resp.json() as any;
    return {
      text: j.candidates?.[0]?.content?.parts?.[0]?.text || '',
      finishReason: j.candidates?.[0]?.finishReason || 'UNKNOWN',
      usage: j.usageMetadata || {},
    };
  }

  // 잘림 복구 (= _call-config.md parse 표준)
  function parse(t: string): any | null {
    const start = t.indexOf('{');
    if (start < 0) return null;
    try { return JSON.parse(t.slice(start, t.lastIndexOf('}') + 1)); } catch (e) {}
    for (let endIdx = t.length - 1; endIdx > start; endIdx--) {
      if (t[endIdx] !== '}') continue;
      const trimmed = t.slice(start, endIdx + 1);
      for (const suffix of [']}}', ']}', '}', '']) {
        try {
          const p = JSON.parse(trimmed + suffix);
          if (p.places) return p;
        } catch (e) {}
      }
    }
    return null;
  }

  // batch loop + adaptive fallback
  let batchCount = 0;
  let totalPlaces = 0;
  const FALLBACK = [40, 30, 20, 10];
  let currSize = batchSize;
  for (let i = 0; i < slice.length; ) {
    const batch = slice.slice(i, i + currSize);
    const offset = startOffset + i;
    const prompt = promptTpl
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\[CITY_NAME\]/g, city.name_en)
      .replace(/\$\{CITY_ID\}/g, String(cityId))
      .replace(/\$\{BATCH_LEN\}/g, String(batch.length))
      .replace(/\$\{JSON_INPUT\}/g, JSON.stringify(batch.map((r: any) => ({
        id: r.id,
        name_en: r.name_en,
        name_local: r.name_local,
        name_ko: r.name_ko,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        google_place_id: r.google_place_id,
        seed_category: r.seed_category,
      }))));

    console.log(`\n--- batch offset=${offset}, size=${batch.length} ---`);
    const t0 = Date.now();
    const r = await callGemini(prompt);
    console.log(`${Date.now() - t0} ms / ${r.finishReason} / 토큰 ${r.usage.totalTokenCount || '?'}`);

    const parsed = parse(r.text);
    const places = parsed?.places || [];
    const missing = batch.filter((b: any) => !places.find((p: any) => p.id === b.id)).length;

    if (places.length === 0 || missing > 5) {
      // fallback = 다음 작은 사이즈
      const idx = FALLBACK.indexOf(currSize);
      if (idx < FALLBACK.length - 1) {
        currSize = FALLBACK[idx + 1];
        console.log(`⚠️ 응답 부족 (= places=${places.length}, missing=${missing}) → fallback batch=${currSize} 재시도`);
        continue;
      } else {
        console.log(`⚠️ batch=10 도 실패 = skip + 다음 batch`);
      }
    }

    fs.writeFileSync(path.join(outDir, `02-enrich-place-batch-${offset}-${today}.json`), JSON.stringify({
      meta: { city_id: cityId, offset, batch_len: batch.length, called_at: new Date().toISOString(), finish_reason: r.finishReason, usage: r.usage },
      places,
    }, null, 2));
    console.log(`✓ 저장 = offset ${offset} (= ${places.length} 응답)`);

    batchCount++;
    totalPlaces += places.length;
    i += batch.length;
  }

  console.log(`\n═══ 결과 ═══`);
  console.log(`batch 호출 = ${batchCount}`);
  console.log(`응답 places = ${totalPlaces}`);
  console.log(`\n다음 = post-process.ts 실행:`);
  console.log(`  npx tsx .../02-enrich-place/post-process.ts --city-id=${cityId} --date=${today}`);
})();
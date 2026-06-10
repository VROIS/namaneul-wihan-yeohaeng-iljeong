// ⚠️ 수정금지(승인필요) 2026-05-20 = 03-downtown-restaurant 실행 진입점 (= 4 호출 분할 = MEAL_BUDGET 4 tier)
// = 호출 1 ECONOMIC (≤€24) / 2 REASONABLE (€25-60) / 3 PREMIUM (€61-180) / 4 LUXURY (€181+)
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/03-downtown-restaurant/run.ts --city-id=19 [--year=2026]
//
// 산출물:
//   docs/raw/{city_id}/03-downtown-restaurant-{tier}-{YYYY-MM-DD}.json
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
const year = String(argv['year'] || new Date().getFullYear());
if (!cityId) { console.error('Usage: --city-id=<N> [--year=2026]'); process.exit(1); }

// ⚠️ 수정금지(승인필요) 2026-05-20 = MEAL_BUDGET 매트릭스 (= types.ts:135-140) 와 1:1 일치 = 변경 시 동기 갱신 필수
const TIER_SPECS = {
  economic:   { label: '30 ECONOMIC',  spec: '30 ECONOMIC (= 1인당 평균 ~€24 이하 = 베이커리/크레페리/패스트/한식 분식)' },
  reasonable: { label: '30 REASONABLE',spec: '30 REASONABLE (= 1인당 평균 €25-60 = 비스트로/브라세리/평범한 디너)' },
  premium:    { label: '30 PREMIUM',   spec: '30 PREMIUM (= 1인당 평균 €61-180 = 미슐랭 빕구르망/한국 vlog 인기 다이닝)' },
  luxury:     { label: '30 LUXURY',    spec: '30 LUXURY (= 1인당 평균 €181+ = 미슐랭 1+ 스타/시그너처)' },
};

(async () => {
  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country, latitude, longitude FROM cities WHERE id=$1', [cityId])).rows[0];
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  await c.end();
  if (!city || !keyRow?.key_value) { console.error('city/Gemini key 미존재'); process.exit(1); }
  const GEMINI_KEY = keyRow.key_value;

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 03-downtown-restaurant ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), year = ${year}, today = ${today}`);

  const promptTpl = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')
    .split('═══════════════════════════════════════════════════════════════════════')[2] || '';

  function build(tier: 'economic' | 'reasonable' | 'premium' | 'luxury', excludeList = ''): string {
    const TIER_LABEL = TIER_SPECS[tier].label;
    const TIER_SPEC = TIER_SPECS[tier].spec;
    const OUTPUT_SPEC = `{ "results": { "${tier}": [ ...30 ] } }`;
    return promptTpl
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{COUNTRY\}/g, city.country)
      .replace(/\$\{CITY_LAT\}/g, String(city.latitude))
      .replace(/\$\{CITY_LNG\}/g, String(city.longitude))
      .replace(/\$\{YEAR\}/g, year)
      .replace(/\$\{TIER_LABEL\}/g, TIER_LABEL)
      .replace(/\$\{TIER_SPEC\}/g, TIER_SPEC)
      .replace(/\$\{OUTPUT_SPEC\}/g, OUTPUT_SPEC)
      .replace(/\$\{EXCLUDE_LIST\}/g, excludeList);
  }

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
            // ⚠️ 수정금지(승인필요) 2026-06-08 사용자 승인 = responseMimeType 제거 = 그라운딩(googleSearch) + mime 'application/json' 동시 불가(INVALID_ARGUMENT = #06 빈응답 버그) = geminiClient.ts:68 정합. prompt "STRICT JSON" 지시 + parseTier() 잘림복구가 JSON 보장.
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

  function parseTier(text: string, key: string): any[] {
    const start = text.indexOf('{');
    if (start < 0) return [];
    try { return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)).results?.[key] || []; } catch (e) { return []; }
  }

  const accumulated: any[] = [];
  for (const tier of ['economic', 'reasonable', 'premium', 'luxury'] as const) {
    console.log(`\n--- 호출 = ${TIER_SPECS[tier].label} ---`);
    const excludeStr = accumulated.length
      ? `\n  이미 추천된 ${accumulated.length} 곳 (= 아래) 와 중복 X:\n` +
        accumulated.map((p: any) => `  - ${p.name_en} (${p.address || ''})`).join('\n')
      : '';
    const t0 = Date.now();
    const r = await callGemini(build(tier, excludeStr));
    console.log(`${Date.now() - t0} ms / ${r.finishReason} / 토큰 ${r.usage.totalTokenCount || '?'}`);
    const outPath = path.join(outDir, `03-downtown-restaurant-${tier}-${today}.json`);
    fs.writeFileSync(outPath, JSON.stringify({
      meta: { city_id: cityId, tier, called_at: new Date().toISOString(), finish_reason: r.finishReason, usage: r.usage, exclude_count: accumulated.length },
      raw_text: r.text,
    }, null, 2));
    const list = parseTier(r.text, tier);
    console.log(`✓ 저장 = ${outPath} (= ${list.length} 곳)`);
    accumulated.push(...list);
  }

  console.log(`\n═══ 합계 = ${accumulated.length} / 120 ═══`);
  console.log(`다음 = post-process.ts (= upsertPlace INSERT) 실행:`);
  console.log(`  npx tsx .claude/skills/raw-db-verify-and-complete/prompts/03-downtown-restaurant/post-process.ts --city-id=${cityId} --date=${today}`);
})();
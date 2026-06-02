// ⚠️ 수정금지(승인필요) 2026-05-20 = 04-outskirt-restaurant 실행 진입점 (= 2 호출 분할)
// = 호출 1 = 30 LOW (= ≤€30) / 호출 2 = 30 MID (= €30-80) + EXCLUDE_LIST 안 호출 1 응답 명시
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/04-outskirt-restaurant/run.ts --city-id=19 --hints="Versailles / Disneyland Paris / ..." [--year=2026]
//
// 산출물:
//   docs/raw/{city_id}/04-outskirt-restaurant-low.json
//   docs/raw/{city_id}/04-outskirt-restaurant-mid.json
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
const hints = String(argv['hints'] || '');
const year = String(argv['year'] || new Date().getFullYear());
if (!cityId || !hints) { console.error('Usage: --city-id=<N> --hints="<도시별 day-trip 명소>"'); process.exit(1); }

(async () => {
  // 1. 도시 + Gemini key
  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query(
    'SELECT name_en, country, latitude, longitude FROM cities WHERE id=$1', [cityId]
  )).rows[0];
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  await c.end();
  if (!city || !keyRow?.key_value) { console.error('city/Gemini key 미존재'); process.exit(1); }
  const GEMINI_KEY = keyRow.key_value;

  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 04-outskirt-restaurant ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), hints = ${hints.slice(0, 60)}...`);

  // 2. prompt 템플릿
  const promptTpl = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')
    .split('═══════════════════════════════════════════════════════════════════════')[2] || '';

  function build(tier: 'low' | 'mid', excludeList = ''): string {
    const TIER_LABEL = tier === 'low' ? '30 LOW' : '30 MID';
    const TIER_SPEC = tier === 'low'
      ? '30 LOW (= 1인당 평균 ~30 EUR 이하 = 저렴)'
      : '30 MID (= 30-80 EUR = 합리적)';
    const OUTPUT_SPEC = tier === 'low'
      ? '{ "results": { "low": [ ...30 ] } }'
      : '{ "results": { "mid": [ ...30 ] } }';
    return promptTpl
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{COUNTRY\}/g, city.country)
      .replace(/\$\{CITY_LAT\}/g, String(city.latitude))
      .replace(/\$\{CITY_LNG\}/g, String(city.longitude))
      .replace(/\$\{YEAR\}/g, year)
      .replace(/\$\{OUTSKIRT_HINTS\}/g, hints)
      .replace(/\$\{TIER_LABEL\}/g, TIER_LABEL)
      .replace(/\$\{TIER_SPEC\}/g, TIER_SPEC)
      .replace(/\$\{OUTPUT_SPEC\}/g, OUTPUT_SPEC)
      .replace(/\$\{EXCLUDE_LIST\}/g, excludeList);
  }

  async function callGemini(prompt: string): Promise<{ text: string; finishReason: string; usage: any }> {
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

  function parseTier(text: string, key: 'low' | 'mid'): any[] | null {
    const start = text.indexOf('{');
    if (start < 0) return null;
    try {
      const p = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
      return p.results?.[key] || null;
    } catch (e) {
      return null;
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // 3. 호출 1 = LOW
  console.log('\n--- 호출 1 = 30 LOW ---');
  const t1 = Date.now();
  const r1 = await callGemini(build('low', ''));
  console.log(`${Date.now() - t1} ms / ${r1.finishReason} / 토큰 ${r1.usage.totalTokenCount}`);
  fs.writeFileSync(path.join(outDir, `04-outskirt-restaurant-low-${today}.json`), JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), finish_reason: r1.finishReason, usage: r1.usage },
    raw_text: r1.text,
  }, null, 2));
  const lowList = parseTier(r1.text, 'low') || [];
  console.log(`✓ low 저장 = ${lowList.length} 곳`);

  // 4. 호출 2 = MID + EXCLUDE_LIST
  console.log('\n--- 호출 2 = 30 MID + EXCLUDE_LIST ---');
  const excludeStr = lowList.length
    ? '\n  이미 추천된 LOW 30 곳 (= 아래) 와 중복 X:\n' + lowList.map((p: any) => `  - ${p.name_en} (${p.address || ''})`).join('\n')
    : '';
  const t2 = Date.now();
  const r2 = await callGemini(build('mid', excludeStr));
  console.log(`${Date.now() - t2} ms / ${r2.finishReason} / 토큰 ${r2.usage.totalTokenCount}`);
  fs.writeFileSync(path.join(outDir, `04-outskirt-restaurant-mid-${today}.json`), JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), finish_reason: r2.finishReason, usage: r2.usage, exclude_count: lowList.length },
    raw_text: r2.text,
  }, null, 2));
  const midList = parseTier(r2.text, 'mid') || [];
  console.log(`✓ mid 저장 = ${midList.length} 곳`);

  console.log(`\n═══ 합계 = ${lowList.length + midList.length} / 60 ═══`);
  console.log(`다음 = post-process.ts (= upsertPlace INSERT) 실행:`);
  console.log(`  npx tsx .claude/skills/raw-db-verify-and-complete/prompts/04-outskirt-restaurant/post-process.ts --city-id=${cityId}`);
})();
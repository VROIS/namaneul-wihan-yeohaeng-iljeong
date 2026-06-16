// ⚠️ 수정금지(승인필요) 2026-05-20 = 05-text-recategorize 실행 진입점
// = 활성 행 SELECT → batch 100 → Gemini 분석 → 정정 후보 list 저장
// = AI 자율 트랜잭션 X = 사용자 cc2 검수 후 post-process.ts 명시 실행
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/05-text-recategorize/run.ts --city-id=19 [--batch=100]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

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
const batchSize = Number(argv['batch'] || 100);
if (!cityId) { console.error('Usage: --city-id=<N> [--batch=100]'); process.exit(1); }

(async () => {
  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  if (!city || !keyRow?.key_value) { await c.end(); console.error('city/Gemini key 미존재'); process.exit(1); }
  const GEMINI_KEY = keyRow.key_value;

  // 활성 행 SELECT (= 묘사 있는 행만)
  const rows = (await c.query(`
    SELECT id, seed_category AS current_category, name_en, name_local,
           summary_ko, editorial_summary, address
    FROM place_seed_raw
    WHERE city_id = $1
      AND (summary_ko IS NOT NULL OR editorial_summary IS NOT NULL)
    ORDER BY id
  `, [cityId])).rows;
  await c.end();

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });
  // ⚠️ 2026-06-15 = 파일명 단일 표준(raw-filename.ts) = {date}_05-text-recategorize_{batch-N|suggestions}.json (날짜앞)
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = batch(외부응답 raw_text)·suggestions(통합 suggestions) 파일별 versionedName
  const { rawName, rawHash, versionedName } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 기존 batch 파일 raw_text 부분만 md5 (meta 제외)
  const hashOfText = (p: string): string | null => { try { return rawHash(JSON.parse(fs.readFileSync(p, 'utf-8')).raw_text); } catch { return null; } };
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 기존 suggestions 파일 suggestions 부분만 md5 (meta 제외)
  const hashOfSugg = (p: string): string | null => { try { return rawHash(JSON.parse(fs.readFileSync(p, 'utf-8')).suggestions); } catch { return null; } };

  console.log(`═══ 05-text-recategorize ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), 활성 행 = ${rows.length}, batch = ${batchSize}, today = ${today}`);

  const promptTpl = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')
    .split('═══════════════════════════════════════════════════════════════════════')[2] || '';

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

  function parseRecat(text: string): any[] {
    const start = text.indexOf('{');
    if (start < 0) return [];
    try { return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)).recategorize || []; } catch (e) { return []; }
  }

  const allSuggestions: any[] = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const prompt = promptTpl
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{CITY_ID\}/g, String(cityId))
      .replace(/\$\{BATCH_LEN\}/g, String(batch.length))
      .replace(/\$\{JSON_INPUT\}/g, JSON.stringify(batch));

    console.log(`\n--- batch offset = ${offset}, size = ${batch.length} ---`);
    const t0 = Date.now();
    const r = await callGemini(prompt);
    console.log(`${Date.now() - t0} ms / ${r.finishReason} / 토큰 ${r.usage.totalTokenCount || '?'}`);

    // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 해싱대상 = 외부응답(r.text)만 (meta/offset/called_at 제외). batch 도 보존 적용(reader 는 suggestions 만 읽음).
    const outPath = path.join(outDir, versionedName(outDir, rawName(5, 'text-recategorize', `batch-${offset}`, today), rawHash(r.text), hashOfText));
    fs.writeFileSync(outPath, JSON.stringify({
      meta: { city_id: cityId, offset, batch_len: batch.length, called_at: new Date().toISOString(), finish_reason: r.finishReason, usage: r.usage },
      raw_text: r.text,
    }, null, 2));
    const suggestions = parseRecat(r.text);
    console.log(`정정 후보 = ${suggestions.length}`);
    allSuggestions.push(...suggestions);
  }

  // 통합 suggestions 저장 (= 사용자 검수용)
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 해싱대상 = 통합 suggestions 부분만 (meta/called_at 제외)
  const mergedPath = path.join(outDir, versionedName(outDir, rawName(5, 'text-recategorize', 'suggestions', today), rawHash(allSuggestions), hashOfSugg));
  fs.writeFileSync(mergedPath, JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), total_input: rows.length, total_suggestions: allSuggestions.length },
    suggestions: allSuggestions,
  }, null, 2));

  console.log(`\n═══ 결과 ═══`);
  console.log(`총 입력 = ${rows.length}`);
  console.log(`총 정정 후보 = ${allSuggestions.length} (= ${(allSuggestions.length / rows.length * 100).toFixed(1)}%)`);
  console.log(`통합 저장 = ${mergedPath}`);
  console.log(`\n⚠️ 다음 = **사용자 cc2 검수 필수** = AI 자율 트랜잭션 X`);
  console.log(`  1. 위 ${mergedPath} 검토`);
  console.log(`  2. 사용자 명시 후:`);
  console.log(`     npx tsx .../05-text-recategorize/post-process.ts --city-id=${cityId} --date=${today} --apply`);
})();
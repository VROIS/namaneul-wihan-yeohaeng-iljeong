// ⚠️ 수정금지(승인필요) 2026-06-01 = 05-restaurant-reverify 실행 진입점 (= 미검증 식당 재검증/채움)
// = 대상 = city 의 restaurant 중 PID+URI 미보유(= TS 미검증) 행 → 40 배치 → Gemini 3.0 grounding → raw 저장
// = 산출물: docs/raw/{city_id}/{YYYY-MM-DD}_05-restaurant-reverify_{tag}{N}.json (= 날짜앞 표준, raw-filename.ts)
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/05-restaurant-reverify/run.ts --city-id=19 [--year=2026] [--batch=40]
// 다음 = post-process.ts (= upsertPlace 덮어쓰기 + 폐업 archive)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const year = String(argv['year'] || new Date().getFullYear());
const batchSize = Number(argv['batch'] || 40);
// ⚠️ 2026-06-01 = --ids 제공 시 = 해당 id 만 재검증 (= 폐업후보 재분류용). 미제공 = 전체 미검증(PID/URI 無)
const idsArg = argv['ids'] ? String(argv['ids']).split(',').map(Number).filter(Boolean) : null;
if (!cityId) { console.error('Usage: --city-id=<N> [--year=2026] [--batch=40] [--ids=1,2,3]'); process.exit(1); }

(async () => {
  const pg = await import('pg');
  const c = new pg.default.Client({ connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  // 대상 = --ids 제공 시 해당 id / 미제공 시 PID+URI 미보유(= TS 미검증) restaurant
  const rows = idsArg
    ? (await c.query(`SELECT id, name_en, address FROM place_seed_raw WHERE id = ANY($1::int[]) ORDER BY rank`, [idsArg])).rows
    : (await c.query(
        `SELECT id, name_en, address FROM place_seed_raw
         WHERE city_id=$1 AND seed_category='restaurant'
           AND NOT (google_place_id IS NOT NULL AND google_place_id<>'' AND google_maps_uri IS NOT NULL AND google_maps_uri<>'')
         ORDER BY rank`, [cityId])).rows;
  await c.end();
  if (!keyRow?.key_value) { console.error('Gemini key 미존재'); process.exit(1); }
  const GEMINI_KEY = keyRow.key_value;

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });
  // ⚠️ 2026-06-15 = 파일명 단일 표준(raw-filename.ts) = {date}_05-restaurant-reverify_{tag}{N}.json (날짜앞)
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = versionedName/rawHash 로 같은 batch 재호출 = _N 순번 보존(손실0)·내용동일=덮어쓰기
  const { rawName, rawHash, versionedName } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);

  const body = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')
    .split('══════════════════════════════════════════════════════════════════════════════')[2] || '';

  const batches: any[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) batches.push(rows.slice(i, i + batchSize));

  console.log(`═══ 05-restaurant-reverify ═══`);
  console.log(`city_id=${cityId}, 대상 미검증 식당=${rows.length}, 배치=${batchSize} → ${batches.length} 호출, year=${year}, today=${today}\n`);

  async function callGemini(prompt: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 50000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } }),
            signal: AbortSignal.timeout(420000) });
        const j = await resp.json() as any;
        return { text: (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(''), finish: j.candidates?.[0]?.finishReason || 'UNKNOWN', usage: j.usageMetadata || {} };
      } catch (e: any) { console.log(`  시도 ${attempt} 실패: ${e.message || e}`); if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 3000)); }
    }
  }
  function parseArr(text: string): any[] {
    const t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { const j = JSON.parse(t); return Array.isArray(j) ? j : (j.results || []); } catch {}
    const a = t.indexOf('['); if (a >= 0) { try { const j = JSON.parse(t.slice(a, t.lastIndexOf(']') + 1)); if (Array.isArray(j)) return j; } catch {} }
    return [];
  }

  let totalParsed = 0, totalClosed = 0;
  for (let b = 0; b < batches.length; b++) {
    const input = batches[b].map(r => ({ id: r.id, name: r.name_en, our_address: r.address }));
    const prompt = body.replace(/\$\{YEAR\}/g, year).replace(/\$\{COUNT\}/g, String(input.length)).replace(/\$\{INPUT_JSON\}/g, JSON.stringify(input));
    const t0 = Date.now();
    console.log(`--- 배치 ${b + 1}/${batches.length} (${input.length}곳) 호출...`);
    const r = await callGemini(prompt);
    const parsed = parseArr(r.text);
    const closed = parsed.filter((p: any) => p.closure_status && p.closure_status !== 'operating').length;
    totalParsed += parsed.length; totalClosed += closed;
    const tag = idsArg ? 'reclass' : 'batch'; // --ids = 재분류 = 1차 batch 파일 안 덮음
    // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 해싱대상=외부응답 raw_text 만(meta 제외) → 같은 batch 재호출 무손실
    const stemFile = rawName(5, 'restaurant-reverify', `${tag}${b + 1}`, today);
    const newHash = rawHash(r.text);
    const fileName = versionedName(outDir, stemFile, newHash, (p: string) => {
      try { return rawHash(JSON.parse(fs.readFileSync(p, 'utf-8')).raw_text); } catch { return null; }
    });
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify({ meta: { city_id: cityId, batch: b + 1, of: batches.length, called_at: new Date().toISOString(), finish: r.finish, usage: r.usage, input_ids: batches[b].map(x => x.id) }, raw_text: r.text, parsed }, null, 2));
    console.log(`    ${Date.now() - t0}ms / ${r.finish} / 토큰 ${r.usage.totalTokenCount || '?'} / 파싱 ${parsed.length} / 폐업 ${closed} → ${path.basename(outPath)}`);
  }

  console.log(`\n═══ 합계 = 파싱 ${totalParsed}/${rows.length} / 폐업·삭제후보 ${totalClosed} ═══`);
  console.log(`다음 = post-process.ts (= upsertPlace 덮어쓰기 + 폐업 archive):`);
  console.log(`  npx tsx .claude/skills/raw-db-verify-and-complete/prompts/05-restaurant-reverify/post-process.ts --city-id=${cityId} --date=${today} --dry`);
})();

// ⚠️ 수정금지(승인필요) 2026-06-02 = 13-restaurant-summary 실행 = RC 있는데 요약 없는 식당 → Gemini 한국 감성 요약 2개 + 가격(blind 추정)
// = 대상 = google_review_count>0 AND summary_ko 비어있음 (= TS풀 신규) → 40 배치 → Gemini(가격 미입력=blind) → raw 저장
// = 가격 = 필수 응답 = TS 실값과 비교(검증) / post-process 가 null 행만 채움 (= TS 가격 덮어쓰기 X)
// = 호출 설정 = 04/05 동일 = gemini-3-flash-preview + googleSearch + json + temp0.2 + maxOutputTokens 50000 + timeout 420s
// = 산출물: docs/raw/{city_id}/13-restaurant-summary-batch{N}-{YYYY-MM-DD}.json
// 호출:
//   npx tsx .../13-restaurant-summary/run.ts --city-id=19 [--year=2026] [--batch=40] [--limit=8]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const limit = argv['limit'] ? Number(argv['limit']) : null;
if (!cityId) { console.error('Usage: --city-id=<N> [--year=2026] [--batch=40] [--limit=8]'); process.exit(1); }

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`)).rows[0];
  const rows = (await c.query(
    `SELECT id, name_en, name_local, address, price_eur::float8 AS price_eur, google_review_count AS rc
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category='restaurant'
       AND google_review_count > 0
       AND (summary_ko IS NULL OR summary_ko='')
     ORDER BY google_review_count DESC ${limit ? 'LIMIT ' + limit : ''}`, [cityId])).rows;
  await c.end();
  if (!keyRow?.key_value) { console.error('Gemini key 미존재'); process.exit(1); }
  const GEMINI_KEY = keyRow.key_value;
  const tsPrice = new Map(rows.map((r: any) => [r.id, r.price_eur])); // = TS 실값 (검증 비교용)

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });
  const body = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')
    .split('══════════════════════════════════════════════════════════════════════════════')[2] || '';

  const batches: any[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) batches.push(rows.slice(i, i + batchSize));

  console.log(`═══ 13-restaurant-summary (가격 blind 추정 = 검증) ═══`);
  console.log(`city_id=${cityId}, 대상=${rows.length}${limit ? ' (limit ' + limit + ')' : ''}, 가격없음=${rows.filter((r: any) => r.price_eur == null).length}, 배치=${batchSize} → ${batches.length} 호출\n`);

  async function callGemini(prompt: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 50000, thinkingConfig: { thinkingBudget: 0 } } }), // ⚠️ 2026-06-09 = responseMimeType 제거(grounding+json 동시 빈응답 버그) = parseArr 가 JSON 보장
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

  let totalParsed = 0;
  for (let b = 0; b < batches.length; b++) {
    // ⚠️ 입력 = 가격 미포함 (= blind 추정 = 검증)
    const input = batches[b].map(r => ({ id: r.id, name: r.name_local || r.name_en, address: r.address, review_count: r.rc }));
    const prompt = body.replace(/\$\{YEAR\}/g, year).replace(/\$\{COUNT\}/g, String(input.length)).replace(/\$\{INPUT_JSON\}/g, JSON.stringify(input));
    const t0 = Date.now();
    console.log(`--- 배치 ${b + 1}/${batches.length} (${input.length}곳) 호출...`);
    const r = await callGemini(prompt);
    const parsed = parseArr(r!.text);
    totalParsed += parsed.length;
    const outPath = path.join(outDir, `13-restaurant-summary-batch${b + 1}-${today}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ meta: { city_id: cityId, batch: b + 1, of: batches.length, called_at: new Date().toISOString(), finish: r!.finish, usage: r!.usage, input_ids: batches[b].map(x => x.id) }, raw_text: r!.text, parsed }, null, 2));
    console.log(`    ${Date.now() - t0}ms / ${r!.finish} / 토큰 ${r!.usage.totalTokenCount || '?'} / 파싱 ${parsed.length} → ${path.basename(outPath)}`);
    // 샘플 = 가격 검증 (Gemini blind vs TS 실값) + 요약
    console.log(`      [id] G추정 vs TS실값 | summary // editorial`);
    parsed.slice(0, 12).forEach((p: any) => {
      const ts = tsPrice.get(p.id);
      const g = p.price_per_person_eur;
      const diff = (g != null && ts != null) ? ` (Δ${g - ts >= 0 ? '+' : ''}${Math.round(g - ts)})` : '';
      console.log(`      [${p.id}] G€${g ?? '?'} vs TS€${ts ?? 'null'}${diff} | ${p.summary_ko} // ${p.editorial_summary}`);
    });
  }
  console.log(`\n═══ 합계 = 파싱 ${totalParsed}/${rows.length} ═══`);
  console.log(`다음 = post-process.ts (= 요약 UPDATE + 가격 null 만 채움, TS 가격은 보존):`);
  console.log(`  npx tsx .../13-restaurant-summary/post-process.ts --city-id=${cityId} --date=${today} [--apply]`);
})();

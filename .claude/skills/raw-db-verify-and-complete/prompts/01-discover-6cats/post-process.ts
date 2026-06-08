// ⚠️ 수정금지(승인필요) 2026-05-20 = 01-discover-6cats 후처리 + DB INSERT
// = README.md 7 요소 중 ⑥ 후처리 + DB INSERT
// = docs/raw/{city_id}/01-discover-6cats.json 읽음 → upsertPlace() v2 단일 진입점 INSERT
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/01-discover-6cats/post-process.ts --city-id=19 [--dry]
//
// 정책 = 헌법 §14 = upsertPlace() 단일 진입점 (= 5 단계 매칭 자동)
//      = §15 = shopping = price_eur null 강제
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
if (!cityId) { console.error('Usage: --city-id=<N> [--date=<YYYY-MM-DD>] [--dry]'); process.exit(1); }
const dryRun = argv['dry'] === 'true';

(async () => {
  // .env 로드
  const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  // 1. 산출물 raw 읽기 (= --date 명시 또는 오늘 날짜)
  const inPath = path.join(ROOT, 'docs', 'raw', String(cityId), `01-discover-6cats-${date}.json`);
  if (!fs.existsSync(inPath)) { console.error(`✗ ${inPath} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  console.log(`═══ 01-discover-6cats post-process ═══`);
  console.log(`city_id = ${cityId}`);
  console.log(`산출물 = ${inPath} (= ${raw.meta?.called_at})`);

  // 2. raw_text 파싱
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
          if (p.results) return p;
        } catch (e) {}
      }
    }
    return null;
  }
  const parsed = parse(raw.raw_text);
  if (!parsed) { console.error('✗ JSON 파싱 실패'); process.exit(1); }

  // 3. upsertPlace 단일 진입점 호출
  // ⚠️ 수정금지(승인필요) 2026-06-07 사용자 승인 = Windows ESM 호환 = pathToFileURL 로 file:// URL 변환 (= 형제 12/post-process 와 동일, c:\ 경로 import ERR_UNSUPPORTED_ESM_URL_SCHEME 수정). 로직·프롬프트 무관.
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  const today = new Date().toISOString().slice(0, 10);

  const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const matchedBy: Record<string, number> = { pid: 0, address: 0, coords: 0, name: 0, none: 0 };

  for (const cat of cats) {
    const places = parsed.results?.[cat] || [];
    console.log(`\n[${cat}] = ${places.length} 행`);
    for (const p of places) {
      try {
        // shopping = price_eur null 강제 (= §15)
        const priceEur = cat === 'shopping' ? null : (p.estimated_price_eur ?? null);

        const r = await upsertPlace({
          cityId,
          seedCategory: cat,
          rank: p.rank,
          nameEn: p.name_en,
          nameLocal: p.name_local || null,
          nameKo: p.name_ko || null,
          address: p.address || null,
          latitude: p.lat ?? null,
          longitude: p.lng ?? null,
          selectionReasonKo: p.selection_reason_ko || null,  // → summary_ko
          shortformKo: p.shortform_ko || null,                // → editorial_summary
          priceEur,
          dayZone: p.day_zone || null,
          distanceKmFromCenter: p.distance_km_from_center ?? null,
          collectionPhase: 'gemini3-2026-05',
          phaseTags: ['gemini3', 'gemini3-2026-05', `discover-6cats-${today}`],
        });
        if (r.action === 'inserted') inserted++;
        else if (r.action === 'updated') updated++;
        else skipped++;
        matchedBy[r.matchedBy || 'none']++;
      } catch (e: any) {
        errors++;
        console.error(`  ✗ ${p.name_en}: ${e.message}`);
      }
    }
  }

  console.log(`\n═══ 결과 ═══`);
  console.log(`inserted = ${inserted}`);
  console.log(`updated  = ${updated}`);
  console.log(`skipped  = ${skipped}`);
  console.log(`errors   = ${errors}`);
  console.log(`매칭 단계:`, matchedBy);

  console.log(`\n✓ Step 1 후처리 완료. 보고서 = report.md 템플릿 채워서 docs/raw/${cityId}/01-discover-6cats-report.md 저장 권장.`);
  process.exit(0);
})();
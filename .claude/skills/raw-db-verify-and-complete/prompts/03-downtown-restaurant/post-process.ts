// ⚠️ 수정금지(승인필요) 2026-05-20 = 03-downtown-restaurant 후처리 + DB INSERT
// = docs/raw/{city_id}/{date}_03-downtown-restaurant_{tier}.json 4 tier 읽음 → upsertPlace() INSERT
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/03-downtown-restaurant/post-process.ts --city-id=19 --date=2026-05-20 [--dry]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const dryRun = argv['dry'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> [--dry]'); process.exit(1); }

(async () => {
  const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  const rawDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  // ⚠️ 수정금지(승인필요) — raw 파일명 표준화: 날짜앞 rawName 형식
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = tier 별 latestVersioned 로 _N 계열 최신 1개 읽기
  const { rawName, latestVersioned } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const tiers = ['economic', 'reasonable', 'premium', 'luxury'] as const;

  function parseTier(text: string, key: string): any[] {
    const start = text.indexOf('{');
    if (start < 0) return [];
    try { return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)).results?.[key] || []; } catch (e) { return []; }
  }

  const all: { tier: string; place: any }[] = [];
  for (const tier of tiers) {
    // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = tier stem 계열 최신(없으면 무순번명=기존 에러 유지)
    const latest = latestVersioned(rawDir, rawName(3, 'downtown-restaurant', tier, date));
    const p = latest ? path.join(rawDir, latest) : path.join(rawDir, rawName(3, 'downtown-restaurant', tier, date));  // ⚠️ 수정금지(승인필요) — raw 파일명 표준화: 날짜앞 rawName 형식
    if (!fs.existsSync(p)) { console.error(`✗ ${p} 미존재 = run.ts 먼저 실행`); process.exit(1); }
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const list = parseTier(j.raw_text, tier);
    console.log(`[${tier}] = ${list.length}`);
    all.push(...list.map(place => ({ tier, place })));
  }
  console.log(`═══ 03-downtown-restaurant post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, 합계 = ${all.length}`);

  // 검증
  const failed = all.filter(x => !(x.place.distance_km_from_center <= 10));
  if (failed.length) {
    console.error(`✗ distance_km_from_center > 10 위반 = ${failed.length} 행`);
  }

  if (dryRun) { console.log('\n=== DRY-RUN === sample:', all.slice(0, 3)); process.exit(0); }

  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);  // ⚠️ 2026-06-08 = Windows ESM file:// 변환 (ERR_UNSUPPORTED_ESM_URL_SCHEME 수정)
  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const matchedBy: Record<string, number> = { pid: 0, uri: 0, address: 0, coords: 0, name_local: 0, name_en: 0, name_ko: 0, none: 0 };  // ⚠️ 2026-06-08 = 7단계 매처 키 정합

  for (const { place: p } of all) {
    try {
      const r = await upsertPlace({
        cityId,
        seedCategory: 'restaurant',
        rank: p.rank,
        nameEn: p.name_en,
        nameLocal: p.name_local || null,
        nameKo: p.name_ko || null,
        address: p.address || null,
        latitude: null,
        longitude: null,
        // ⚠️ 2026-06-12 카피 필드명 통폐합 = 응답 키 summary_ko/editorial_summary (= DB 컬럼명) 우선, 옛 raw fallback = 손실 0
        selectionReasonKo: p.summary_ko ?? p.selection_reason_ko ?? null,
        shortformKo: p.editorial_summary ?? p.shortform_ko ?? null,
        priceEur: p.price_eur ?? null,        // COALESCE 새우선(최신최우선) 정책
        dayZone: 'core',                            // 강제
        distanceKmFromCenter: p.distance_km_from_center ?? null,
        collectionPhase: 'gemini3-2026-05',
        phaseTags: ['gemini3', 'gemini3-2026-05', `downtown-restaurant-${today}`],
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

  console.log(`\n═══ 결과 ═══`);
  console.log(`inserted = ${inserted} / updated = ${updated} / skipped = ${skipped} / errors = ${errors}`);
  console.log(`매칭 단계:`, matchedBy);
})();
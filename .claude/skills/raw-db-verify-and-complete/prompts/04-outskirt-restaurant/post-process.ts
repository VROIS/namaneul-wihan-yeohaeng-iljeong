// ⚠️ 수정금지(승인필요) 2026-05-20 = 04-outskirt-restaurant 후처리 + DB INSERT
// = docs/raw/{city_id}/04-outskirt-restaurant-{low,mid}.json 읽음 → upsertPlace() INSERT
//
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/04-outskirt-restaurant/post-process.ts --city-id=19 [--dry]
//
// 정책 = §14 upsertPlace 단일 진입점 + §15 가격 GREATEST + day_zone 강제 'outskirt'
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');  // ⚠️ 2026-06-08 = prompts/04 un-archive 복귀 = 상위 5 (표준 스킬 위치 = 아카이브 ROOT 버그 근본해소)
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const dryRun = argv['dry'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> [--date=<YYYY-MM-DD>] [--dry]'); process.exit(1); }

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
  const lowPath = path.join(rawDir, `04-outskirt-restaurant-low-${date}.json`);
  const midPath = path.join(rawDir, `04-outskirt-restaurant-mid-${date}.json`);
  if (!fs.existsSync(lowPath) || !fs.existsSync(midPath)) {
    console.error(`✗ ${lowPath} 또는 ${midPath} 미존재 = run.ts 먼저 실행`); process.exit(1);
  }

  function parseTier(text: string, key: 'low' | 'mid'): any[] {
    const start = text.indexOf('{');
    if (start < 0) return [];
    try { return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)).results?.[key] || []; } catch (e) { return []; }
  }

  const lowJson = JSON.parse(fs.readFileSync(lowPath, 'utf-8'));
  const midJson = JSON.parse(fs.readFileSync(midPath, 'utf-8'));
  const low = parseTier(lowJson.raw_text, 'low');
  const mid = parseTier(midJson.raw_text, 'mid');
  const all = [...low, ...mid];

  console.log(`═══ 04-outskirt-restaurant post-process ═══`);
  console.log(`city_id = ${cityId}, low = ${low.length}, mid = ${mid.length}, 합계 = ${all.length}`);

  // 검증 = 외곽 강제 + 중복 방지
  const failed = all.filter(p => !(p.distance_km_from_center > 10 && p.distance_km_from_center <= 100));
  if (failed.length) {
    console.error(`✗ distance_km_from_center 위반 = ${failed.length} 행 = sample:`, failed.slice(0, 3).map(p => p.name_en));
  }

  if (dryRun) {
    console.log('\n=== DRY-RUN ===');
    console.log('low sample:', low.slice(0, 2));
    console.log('mid sample:', mid.slice(0, 2));
    process.exit(0);
  }

  // upsertPlace INSERT
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);  // ⚠️ 2026-06-08 = Windows ESM file:// 변환 (ERR_UNSUPPORTED_ESM_URL_SCHEME 수정, 01-discover/post 와 동일)
  const today = new Date().toISOString().slice(0, 10);

  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const matchedBy: Record<string, number> = { pid: 0, uri: 0, address: 0, coords: 0, name_local: 0, name_en: 0, name_ko: 0, none: 0 };  // ⚠️ 2026-06-08 = 7단계 매처 키 정합

  for (const p of all) {
    try {
      const r = await upsertPlace({
        cityId,
        seedCategory: 'restaurant',
        rank: p.rank,
        nameEn: p.name_en,
        nameLocal: p.name_local || null,
        nameKo: p.name_ko || null,
        address: p.address || null,
        latitude: null,  // = 본 prompt 응답 X
        longitude: null,
        selectionReasonKo: p.selection_reason_ko || null,
        shortformKo: p.shortform_ko || null,
        priceEur: p.price_eur ?? null,                    // GREATEST 정책 (= §14)
        dayZone: 'outskirt',                                   // = 강제
        distanceKmFromCenter: p.distance_km_from_center ?? null,
        collectionPhase: 'gemini3-2026-05',
        phaseTags: ['gemini3', 'gemini3-2026-05', `outskirt-restaurant-${today}`],
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
  console.log(`inserted = ${inserted}`);
  console.log(`updated  = ${updated}`);
  console.log(`skipped  = ${skipped}`);
  console.log(`errors   = ${errors}`);
  console.log(`매칭 단계:`, matchedBy);
})();
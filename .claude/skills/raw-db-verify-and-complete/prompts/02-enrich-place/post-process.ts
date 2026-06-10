// ⚠️ 수정금지(승인필요) 2026-05-20 = 02-enrich-place 후처리 + DB UPDATE
// = docs/raw/{city_id}/02-enrich-place-batch-*-{date}.json 모두 읽음 → upsertPlace() v2 단일 진입점 UPDATE
//
// 호출:
//   npx tsx .../02-enrich-place/post-process.ts --city-id=19 [--date=<YYYY-MM-DD>] [--dry]
//
// 정책 = 헌법 §14 = upsertPlace() 단일 진입점
//      = §15 = shopping = price_eur null 강제
//      = COALESCE 옛 우선 (= 식별 데이터) / GREATEST (= 가격) / 새 우선 (= 카피)
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
  if (!fs.existsSync(rawDir)) { console.error(`✗ ${rawDir} 미존재`); process.exit(1); }
  const files = fs.readdirSync(rawDir).filter(f => f.startsWith('02-enrich-place-batch-') && f.endsWith(`-${date}.json`)).sort();
  console.log(`═══ 02-enrich-place post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, batch 파일 = ${files.length}`);
  if (files.length === 0) { console.error(`✗ docs/raw/${cityId}/02-enrich-place-batch-*-${date}.json 미존재 = run.ts 먼저 실행`); process.exit(1); }

  const allPlaces: any[] = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf-8'));
    const places = j.places || [];
    allPlaces.push(...places);
  }
  console.log(`총 응답 places = ${allPlaces.length}`);

  if (dryRun) {
    console.log('\n=== DRY-RUN === sample:', allPlaces.slice(0, 3));
    process.exit(0);
  }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);

  let updated = 0, skipped = 0, errors = 0;
  for (const p of allPlaces) {
    if (!p.id || !p.name_en) { skipped++; continue; }
    try {
      // ⚠️ 수정금지(승인필요) 2026-06-04 = 원본 식별자(PID/URI/name_en/주소/좌표)로 upsertPlace 5단계 매칭 (= id 직접 UPDATE 우회 금지 = 사용자 SSOT). Gemini=큐레이션만.
      const existRow = (await c.query('SELECT seed_category, name_en, name_local, address, latitude, longitude, google_place_id, google_maps_uri FROM place_seed_raw WHERE id=$1', [p.id])).rows[0];
      if (!existRow) { skipped++; continue; }
      const cat = existRow.seed_category;
      const priceEur = cat === 'shopping' ? null : (p.price_eur ?? null);

      const r = await upsertPlace({
        cityId,
        seedCategory: cat,
        nameEn: existRow.name_en,                              // 원본 = Gemini 이름변경 방지 = 매칭 키 보존
        nameLocal: existRow.name_local || p.name_local || null,
        nameKo: p.name_ko || null,                             // Gemini 큐레이션 = 결함 채움
        address: existRow.address || p.address || null,        // 원본 우선
        latitude: existRow.latitude ?? p.latitude ?? null,
        longitude: existRow.longitude ?? p.longitude ?? null,
        googlePlaceId: existRow.google_place_id || null,       // 원본 PID = 5단계 1순위 매칭
        googleMapsUri: existRow.google_maps_uri || null,       // 원본 URI = 5단계 2순위
        selectionReasonKo: p.summary_ko || null,               // → summary_ko
        shortformKo: p.editorial_summary || null,               // → editorial_summary
        priceEur,
        collectionPhase: 'gemini3-2026-05',
      });
      if (r.action === 'updated') updated++;
      else skipped++;
    } catch (e: any) {
      errors++;
      console.error(`  ✗ id=${p.id} ${p.name_en}: ${e.message}`);
    }
  }
  await c.end();

  console.log(`\n═══ 결과 ═══`);
  console.log(`updated = ${updated} / skipped = ${skipped} / errors = ${errors}`);
})();
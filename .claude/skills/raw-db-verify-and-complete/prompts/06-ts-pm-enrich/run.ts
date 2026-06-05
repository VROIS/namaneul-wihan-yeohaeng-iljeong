// ⚠️ 수정금지(승인필요) 2026-05-20 = 06-ts-pm-enrich dry-run
// = 대상 행 = TS Enterprise textSearch (= FieldMask validateFieldMask 강제) → 응답 저장
// = post-process.ts 가 = PhotoMedia + Storage 업로드 + upsertPlace UPDATE
//
// 호출:
//   npx tsx .../06-ts-pm-enrich/run.ts --city-id=19
//
// 산출물 = docs/raw/{city_id}/06-ts-pm-enrich-candidates-{YYYY-MM-DD}.json
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
if (!cityId) { console.error('Usage: --city-id=<N>'); process.exit(1); }

// ⚠️ 수정금지(승인필요) 2026-06-05 = 옛 자체 마스크 폐기 = 표준 9요소 관문(tsSearch) 으로 일원화
//   = 옛 마스크는 businessStatus(영업상태) 누락 + priceLevel/openingHours/types/primaryType 잡음 4개 = 앱 전체 9요소 불일치 원인
//   = 이제 tsSearch() 통과 = 어디서든 동일 9요소 (PID·이름·주소·좌표·리뷰수·가격·사진·mapsUri·영업상태)

(async () => {
  // ⚠️ 수정금지(승인필요) 2026-06-05 = TS 호출 단일 관문 = tsSearch (= 9요소 FieldMask 함수내 박힘 = SKU 가드 내장)
  const { tsSearch } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/ts-client.ts')).href);
  const { STANDARD_TS_FIELD_MASK } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/google-places-sku.ts')).href);

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country_code FROM cities WHERE id=$1', [cityId])).rows[0];
  // ⚠️ 2026-05-20 = 시스템 SSOT = GOOGLE_MAPS_API_KEY 단일 (= Maps + Places 공유 GCP 키)
  const keyRow = (await c.query(
    `SELECT key_value FROM api_keys WHERE key_name IN ('GOOGLE_MAPS_API_KEY','GOOGLE_PLACES_API_KEY') AND is_active=true ORDER BY key_name LIMIT 1`
  )).rows[0];

  // 대상 = image NULL OR pid NULL + 식당/어드벤처 OR rank 1-20
  const rows = (await c.query(`
    SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude,
           google_place_id, image_url
    FROM place_seed_raw
    WHERE city_id = $1
      AND ((image_url IS NULL OR image_url = '') OR google_place_id IS NULL)
      AND (seed_category IN ('restaurant', 'adventure') OR rank <= 20)
    ORDER BY seed_category, rank NULLS LAST
  `, [cityId])).rows;
  await c.end();

  if (!keyRow?.key_value) { console.error('GOOGLE_PLACES_API_KEY 미존재 = api_keys DB 확인'); process.exit(1); }
  const PLACES_KEY = keyRow.key_value;

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 06-ts-pm-enrich dry-run ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), 대상 = ${rows.length} 행`);
  console.log(`마스크 = 표준 9요소 관문(tsSearch) = 앱 전체 동일 (= SKU 가드 내장)`);
  console.log(`예상 비용 = ${rows.length} × $0.035 = $${(rows.length * 0.035).toFixed(2)} (= 무료 1K/월 적용 시 = $0)`);

  // ⚠️ 수정금지(승인필요) 2026-06-05 = 관문 tsSearch 호출 래퍼 (= 옛 {status,places,error} 형태 보존 = 아래 루프 무변경)
  //   = 입력 nameLocal+address → 좌표 없음 = textQuery "이름 주소" 결합 (= 옛 동작 동일) / maxResults=5 / 'ko' / regionCode
  async function callTs(name: string, addr: string | null): Promise<{ status: number | string; places: any[]; error: any }> {
    try {
      const places = await tsSearch({
        apiKey: PLACES_KEY,
        method: 'searchText',
        nameLocal: name,
        address: addr,
        regionCode: city.country_code || undefined,
        languageCode: 'ko',
        maxResults: 5,
      });
      return { status: 200, places, error: null };
    } catch (e: any) {
      return { status: 'error', places: [], error: { message: e?.message || String(e) } };
    }
  }

  const results: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name_en) { results.push({ id: row.id, status: 'no_name' }); continue; }

    const t0 = Date.now();
    const r = await callTs(row.name_en, row.address);
    const dt = Date.now() - t0;

    if (r.status !== 200) {
      results.push({ id: row.id, name: row.name_en, status: 'api_error', code: r.status, error: r.error?.message });
      console.log(`  [${i+1}/${rows.length}] ✗ ${row.name_en} = ${r.status} ${r.error?.message || ''}`);
      continue;
    }
    if (r.places.length === 0) {
      results.push({ id: row.id, name: row.name_en, status: 'no_match' });
      console.log(`  [${i+1}/${rows.length}] ✗ ${row.name_en} = no_match (${dt}ms)`);
      continue;
    }
    const top = r.places[0];
    results.push({
      id: row.id, rank: row.rank, name: row.name_en, category: row.seed_category,
      our_pid: row.google_place_id, our_image: !!row.image_url,
      status: 'ok',
      // ⚠️ 수정금지(승인필요) 2026-06-05 = 관문 TsPlace(9요소 매핑형) → 산출 JSON (= post-process 가 읽는 키 보존)
      //   = businessStatus(9요소째) 추가 = 옛 마스크 누락분 복구 / 미사용 types 제거
      ts: {
        place_id: top.googlePlaceId,
        display_name_ko: top.nameLocal,
        address: top.address,
        lat: top.latitude,
        lng: top.longitude,
        review_count: top.googleReviewCount,
        price_eur: top.priceEur,
        photo_name: top.photoName,
        google_maps_uri: top.googleMapsUri,
        business_status: top.businessStatus,
      },
    });
    if (i % 10 === 0) console.log(`  [${i+1}/${rows.length}] ok = ${top.nameLocal} (${dt}ms)`);
  }

  const outPath = path.join(outDir, `06-ts-pm-enrich-candidates-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), input_rows: rows.length, field_mask: STANDARD_TS_FIELD_MASK },
    results,
  }, null, 2));

  const stats: Record<string, number> = {};
  for (const r of results) stats[r.status] = (stats[r.status] || 0) + 1;
  console.log(`\n═══ 결과 ═══`);
  console.log(JSON.stringify(stats, null, 2));
  console.log(`✓ 저장 = ${outPath}`);
  console.log(`\n⚠️ 사용자 cc2 검수 필수 = PhotoMedia 다운 + Storage 업로드 + upsertPlace UPDATE 는 post-process.ts:`);
  console.log(`  npx tsx .../06-ts-pm-enrich/post-process.ts --city-id=${cityId} --date=${today} --apply-status=ok [--photo] [--apply-ids=N,N,...]`);
})();
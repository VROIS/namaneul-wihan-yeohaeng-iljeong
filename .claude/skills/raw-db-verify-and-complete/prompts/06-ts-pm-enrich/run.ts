// ⚠️ 수정금지(승인필요) 2026-05-20 = 06-ts-pm-enrich dry-run
// = 대상 행 = TS Enterprise textSearch (= FieldMask validateFieldMask 강제) → 응답 저장
// = post-process.ts 가 = PhotoMedia + Storage 업로드 + upsertPlace UPDATE
//
// 호출:
//   npx tsx .../06-ts-pm-enrich/run.ts --city-id=19
//
// 산출물 = docs/raw/{city_id}/{YYYY-MM-DD}_06-ts-pm-enrich_candidates.json (= 날짜앞 표준, raw-filename.ts)
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
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (= 직독 폐기). TS 보강 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const today = new Date().toISOString().slice(0, 10);
  const PLACES_KEY = (await c.query(
    `SELECT public.issue_api_key('GOOGLE_MAPS_API_KEY', $1, $2, true) AS k`,
    [cityId, today],
  )).rows[0]?.k;

  // ⚠️ 수정금지(승인필요) 2026-06-13 사용자 SSOT = 식당 대상 = 30/90/30 노출풀 결손만 (= 비용 신중 = 풀밖 바닥식당 호출 X)
  //   = 식당 = 가격대구간(eco≤24 30 / reason 25~60 90 / premium 61+ 30, luxury 통합) RC DESC ROW_NUMBER ≤ 구간정원 AND (image 결손 OR pid 결손)
  //   = 비식당(6 카테고리) = 기존 유지 = rank≤20 AND (image 결손 OR pid 결손). adventure 도 rank≤20 으로 일원화(옛 전체 → 풀 기준).
  //   = 이미지결손 = image_url NULL/빈 OR WK(위키미디어 환각) = #29/ts-photo-fill 과 동일 기준.
  // ⚠️ 수정금지(승인필요) 2026-06-14 = 식당 대상 = 즉석계산 단일 쿼리 (= PSR rc-rerank 가 RC 랭킹 자동 관리, 풀 고정 불필요)
  //   = 식당 = 가격대별 ROW_NUMBER 30/90/30 AND 결손조건 / 비식당 = rank≤20 AND 결손조건 / $1=cityId 만
  const rows: any[] = (await c.query(`
    WITH rest AS (
      SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude, google_place_id, image_url,
             ROW_NUMBER() OVER (
               PARTITION BY CASE WHEN price_eur <= 24 THEN 'eco' WHEN price_eur <= 60 THEN 'reason' ELSE 'premium' END
               ORDER BY google_review_count DESC NULLS LAST
             ) AS band_rn,
             CASE WHEN price_eur <= 24 THEN 30 WHEN price_eur <= 60 THEN 90 ELSE 30 END AS band_quota
      FROM place_seed_raw
      WHERE city_id = $1 AND seed_category = 'restaurant' AND price_eur IS NOT NULL
    )
    SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude, google_place_id, image_url
    FROM rest
    WHERE band_rn <= band_quota
      AND (image_url IS NULL OR image_url = '' OR image_url LIKE '%wiki%' OR google_place_id IS NULL)
    UNION ALL
    SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude, google_place_id, image_url
    FROM place_seed_raw
    WHERE city_id = $1 AND seed_category <> 'restaurant' AND rank <= 20
      AND (image_url IS NULL OR image_url = '' OR image_url LIKE '%wiki%' OR google_place_id IS NULL)
    ORDER BY seed_category, rank NULLS LAST
  `, [cityId])).rows;
  await c.end();

  if (!PLACES_KEY) { console.error('GOOGLE_MAPS_API_KEY 미발급 = 출입증 검문 미달 또는 api_keys DB 확인'); process.exit(1); }

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
        // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = displayName 한국어 강제 안 함
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
        // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
        display_name_en: top.nameEn,
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
    // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
    if (i % 10 === 0) console.log(`  [${i+1}/${rows.length}] ok = ${top.nameEn} (${dt}ms)`);
  }

  // ⚠️ 2026-06-15 = 파일명 단일 표준(raw-filename.ts) = {date}_06-ts-pm-enrich_candidates.json (날짜앞)
  // ⚠️ 수정금지(승인필요) — raw 버전순번/06 reader 정합(2026-06-16 SSOT)
  //   = (2) 버전순번 = versionedName 으로 첫=무순번 / 이후=_N+1 / 내용동일(rawHash 같음)=덮어쓰기.
  //   = 해싱대상 = 외부응답 results 부분만 (meta/called_at 절대 제외 = 진짜 중복 판별).
  //   = hashOf = 기존 파일 열어서 j.results 의 rawHash (= writer 와 동일 외부응답 부분 기준).
  const { rawName, versionedName, rawHash } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const stemFile = rawName(6, 'ts-pm-enrich', 'candidates', today);                                // = 무순번 기본 파일명(신표준)
  const hashOf = (p: string): string | null => {                                                   // = 기존 파일 results 부분만 해시
    try { return rawHash(JSON.parse(fs.readFileSync(p, 'utf-8')).results); } catch { return null; }
  };
  const outName = versionedName(outDir, stemFile, rawHash(results), hashOf);                        // = 버전순번 적용 파일명
  const outPath = path.join(outDir, outName);
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
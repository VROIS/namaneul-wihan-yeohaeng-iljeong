// ⚠️ 수정금지(승인필요) 2026-05-20 = 06-ts-pm-enrich 후처리 = PhotoMedia + Storage + DB UPDATE
// = TS 응답 candidates 읽음 → photo 다운 → Supabase Storage 업로드 → upsertPlace UPDATE
//
// 호출:
//   npx tsx .../06-ts-pm-enrich/post-process.ts --city-id=19 --date=2026-05-20 --apply-status=ok [--photo]
//
// --photo 명시 시 = PhotoMedia 다운 + Storage 업로드 (= 추가 비용 $0.007/행)
// --photo 없으면 = TS 메타만 (= price/review/pid/mapsUri) UPDATE
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const applyStatus = (argv['apply-status'] || '').split(',').filter(Boolean);
const applyIds = (argv['apply-ids'] || '').split(',').filter(Boolean).map(Number);
const downloadPhoto = argv['photo'] === 'true';
const apply = applyStatus.length > 0 || applyIds.length > 0;
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> --apply-status=ok [--photo] [--apply-ids=N,N,...]'); process.exit(1); }

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

  // ⚠️ 수정금지(승인필요) — raw 버전순번/06 reader 정합(2026-06-16 SSOT)
  //   = (1) 옛 하드코딩명 '06-ts-pm-enrich-candidates-{date}.json' 폐기 → writer(run.ts) 신표준 rawName(6,...) 으로 정합 (rawName 파일명 규칙).
  //   = (3) 버전순번 = latestVersioned 로 stem 계열(_N) 중 최신 1개 선택. 없으면 기존 미존재 에러.
  const { rawName, latestVersioned } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const inDir = path.join(ROOT, 'docs', 'raw', String(cityId));                                    // = 산출물 폴더(불변)
  const stemFile = rawName(6, 'ts-pm-enrich', 'candidates', date);                                 // = 무순번 기본 파일명(신표준)
  const inName = latestVersioned(inDir, stemFile);                                                 // = stem 계열 최신 1개(_N 포함) 또는 null
  if (!inName) { console.error(`✗ ${path.join(inDir, stemFile)} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const inPath = path.join(inDir, inName);
  const j = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const selected = (j.results || []).filter((r: any) =>
    applyStatus.includes(r.status) || applyIds.includes(r.id)
  );
  // ⚠️ 수정금지(승인필요) 2026-06-12 = businessStatus 폐업 필터 (= ts-backfill 과 일관 = 사용자 SSOT 갈래 2)
  //   = businessStatus = 유동적 정보 = DB 컬럼 저장 X = 영업중(OPERATIONAL)만 upsert 통과 = 폐업/임시휴업 제외.
  //   = run.ts 가 raw 에 business_status 저장(9요소째) → 여기서 읽어 필터. (옛 = 미필터 = 폐업도 입력되던 버그.)
  const closedOut = selected.filter((r: any) => r.ts?.business_status && r.ts.business_status !== 'OPERATIONAL');
  const candidates = selected.filter((r: any) => !r.ts?.business_status || r.ts.business_status === 'OPERATIONAL');

  console.log(`═══ 06-ts-pm-enrich post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, photo download = ${downloadPhoto}`);
  if (closedOut.length) console.log(`🚫 폐업/휴업 제외 = ${closedOut.length}곳: ${closedOut.map((r: any) => `${r.name}(${r.ts.business_status})`).join(', ')}`);
  console.log(`적용 대상 = ${candidates.length} 행`);

  if (!apply) {
    console.log('\n--- DRY-RUN = --apply-status 또는 --apply-ids 명시 후 실행 ---');
    process.exit(0);
  }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유. PM 이미지 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const { issueApiKey } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/issue-api-key.ts')).href);
  const PLACES_KEY = downloadPhoto ? await issueApiKey(c, 'GOOGLE_MAPS_API_KEY', cityId, date, true) : null;

  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  // ⚠️ 수정금지(승인필요) 2026-06-05 = 사진 단일 관문 = tsPhoto (= PhotoMedia 다운 + Storage 업로드 일원화 = 앱 전체 동일 라인)
  const { tsPhoto } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/ts-client.ts')).href);

  // Supabase Storage 업로드용 (= REST API 직접 호출 = supabase-js 의존 회피)
  // ⚠️ 수정금지(승인필요) 2026-06-14 사용자 SSOT = SUPA_PUBLIC 도출 = save-raw.ts·tsPhoto 와 동일화 (= 불일치 버그 해소)
  //   = 옛 SUPA_URL 정규식 추출 = .env SUPA_URL 이 postgresql:// 접속문자열이라 매칭 실패 → SUPA_PUBLIC='' → Storage 업로드 Invalid URL → 이미지 0 버그.
  //   = 시스템 SSOT = SUPABASE_PUBLIC_URL 환경변수 단일 + 하드코딩 fallback (= save-raw line21 동일).
  const STORAGE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  // ⚠️ 수정금지(승인필요) 2026-06-14 사장님 SSOT = PM 저장경로 = {cityId}/{category}/{PID} (PID 결정적).
  //   = 원칙: PID 있어야만 구글이미지 인정 → PID 없으면 PM 자체 불성립(Storage 입력 X = WK 폴백 유지).
  //   = 경로 = PID 결정적 → row 가 바뀌어도(merge/rename) storage-image-relink 가 항상 찾음 = 고아 영구 방지 = Storage↔DB image_url 일치.
  //   = 옛 {cityId}/{rowId}-{ts} 폐기(= rowId·타임스탬프 비결정적 = row 바뀌면 고아 = relink 불가 = 밑빠진독 원인, [[feedback_internal_first_recover]]).
  //   = 업로드 = tsPhoto 단일 관문(PUT+x-upsert) = bucket place-images, 해상도 = 관문 기본 PHOTO_MAX_WIDTH_PX(400) 단일 SSOT(2026-07-09).
  const SUPA_PUBLIC = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
  async function downloadAndUpload(photoName: string, category: string, pid: string): Promise<string | null> {
    if (!PLACES_KEY || !SUPA_PUBLIC || !STORAGE_KEY) return null;
    return await tsPhoto({
      apiKey: PLACES_KEY,
      photoName,
      storageKey: STORAGE_KEY,
      supaPublicUrl: SUPA_PUBLIC,
      pathKey: `${cityId}/${category}/${pid}`,
      bucket: 'place-images',
      // maxWidthPx 미지정 = 관문 기본 PHOTO_MAX_WIDTH_PX(400) = 사진 해상도 단일 SSOT(§16, 2026-07-09 사장님).
    });
  }

  let updated = 0, photo_ok = 0, errors = 0;
  for (const r of candidates) {
    try {
      let imageUrl: string | null = null;
      // ⚠️ 수정금지(승인필요) 2026-06-14 사장님 SSOT = PID 있어야만 구글이미지 성립 → PID 없으면 PM 스킵(= 구글이미지 불성립, WK 폴백 유지).
      //   = 경로가 PID 결정적이므로 PID 없는 행은 Storage 입력 대상 자체가 아님.
      if (downloadPhoto && r.ts?.photo_name && r.ts?.place_id) {
        imageUrl = await downloadAndUpload(r.ts.photo_name, r.category, r.ts.place_id);
        if (imageUrl) photo_ok++;
      }

      const result = await upsertPlace({
        cityId,
        seedCategory: r.category,
        // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
        //   = TS displayName(영어)을 name_en 칸으로(새 우선, place-upsert COALESCE). TS 결과 없으면 기존 r.name(name_en) 폴백 = 필수필드 보장.
        nameEn: r.ts?.display_name_en || r.name,
        //   = TS는 name_ko 안 채움(=Gemini전용) → null 전달 = place-upsert COALESCE가 기존 Gemini name_ko 보존.
        nameKo: null,
        address: r.ts?.address || null,
        latitude: r.ts?.lat ?? null,
        longitude: r.ts?.lng ?? null,
        googlePlaceId: r.ts?.place_id || null,
        googleMapsUri: r.ts?.google_maps_uri || null,
        googleReviewCount: r.ts?.review_count ?? null,
        priceEur: r.ts?.price_eur ?? null,
        imageUrl: imageUrl || undefined,  // = 새 우선 = 새 이미지 있으면 덮어씀, 없으면(undefined) 옛 보존
        collectionPhase: 'gemini3-2026-05',
      });
      if (result.action === 'updated' || result.action === 'inserted') updated++;
      console.log(`✓ id=${r.id} ${r.name} = ${result.action} ${imageUrl ? '+photo' : ''}`);
    } catch (e: any) {
      errors++;
      console.error(`  ✗ id=${r.id} ${r.name}: ${e.message}`);
    }
  }
  await c.end();

  console.log(`\n═══ 결과 ═══`);
  console.log(`updated = ${updated} / photo_ok = ${photo_ok} / errors = ${errors}`);
})();
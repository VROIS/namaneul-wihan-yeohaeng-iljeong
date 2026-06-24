// ⚠️ 영구 컴포넌트 2026-06-10 = 결손 이미지 = Storage 재링크 우선(무료) = PM(유료) 전 단계
// = 이미지 없는 행의 google_place_id 가 place-images 버킷에 이미 있으면(결제된 PM 고아) image_url 재링크 = 외부호출 0·€0
// = 원인: 07-merge 병합 / ts-name-recover 재생성 으로 row 가 바뀌며 image_url 유실 → 결제된 이미지가 link 끊긴 채 방치(고아).
// = 내부 우선 복구 [[feedback_internal_first_recover]]. 재링크 후에도 storage 에 없는 것만 PM(유료).
// = 쓰기 = upsertPlace 단일 진입점(§14). 같은 카테고리 폴더 우선, 없으면 타 폴더 PID 매칭(멀티태그 이미지 재활용).
// = 배선: #45 결손보강 WF (fillcity/repair.ts) 가 PM 직전 relinkStorageImages() 호출 → matchedIds 는 PM 대상에서 제외 (2026-06-24 §19).
// 직접 실행(전 도시 일괄): npx tsx server/services/fill/storage-image-relink.ts --city-id=37 [--apply]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const BUCKET = 'place-images';

// ── 재사용 함수 = PM 전 무료 재링크 (#45 결손보강 WF 가 import) ──
//   client = 호출자의 pg Client (열린 상태) · categories = 한정(예: ['restaurant']) 없으면 전체
//   반환 matchedIds = storage 에 있는(=PM 불필요) row id → 호출자가 PM 대상에서 제외
export async function relinkStorageImages(opts: {
  cityId: number; apply: boolean; client: any;
  categories?: string[]; bucket?: string; supaPublicUrl?: string;
}): Promise<{ relinkable: number; relinked: number; matchedIds: Set<number>; byCat: Record<string, { hit: number; linked: number; miss: number }> }> {
  const { cityId, apply, client: c } = opts;
  const bucket = opts.bucket || BUCKET;
  const supaPublicUrl = opts.supaPublicUrl || process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
  const useCat = !!(opts.categories && opts.categories.length > 0);
  const params: any[] = [cityId, bucket];
  if (useCat) params.push(opts.categories);
  // ⚠️ 수정금지(승인필요) 2026-06-14 사용자 SSOT = "구글이미지(Storage PID) 있으면 무조건 교체" (= PM 비용 절감 핵심).
  //   = 옛 결함: `image_url IS NULL` 한정 → WK(위키 가짜)·OTHER 가 가리키는 고아 이미지를 복구 못 함(누수).
  //     실측(전 도시 PID 보유행): Storage 진짜이미지 보유인데 DB는 WK 77 / NULL 3 / OTHER 3 = 80+행이 가짜·빈 이미지 노출.
  //   = 신규칙: image_url 종류 무관 = Storage 에 PID 이미지 존재(obj NOT NULL)하면 대상. 단 이미 그 PID Storage 를 정확히
  //     가리키는 행(image_url = 같은 obj URL)은 제외 = 불필요 쓰기 0 (= 결과 동일, [[feedback_systemic_not_bandaid]]).
  //   = 원칙: PID 보유 = 이미 TS/PM(유료) 거친 증거 → Storage 에 받아둔 결제 이미지를 DB 가 무조건 가리켜야 함(고아 0).
  const rows = (await c.query(`
    SELECT p.id, p.seed_category AS cat, p.name_en, p.name_local, p.google_place_id AS pid, p.rank, p.image_url AS cur_url,
      -- 정확 매칭 = {cityId}/{cat}/{pid}.{ext} (city 앵커 = sargable, pid=파일명 = 느슨한 %pid% 회피). 멀티태그 = 타 cat 폴더 허용, 같은 cat 우선.
      (SELECT o.name FROM storage.objects o
        WHERE o.bucket_id = $2 AND o.name LIKE p.city_id::text || '/%/' || p.google_place_id || '.%'
        ORDER BY (o.name LIKE p.city_id || '/' || p.seed_category || '/%') DESC, o.name LIMIT 1) AS obj
    FROM place_seed_raw p
    WHERE p.city_id = $1 AND p.google_place_id IS NOT NULL${useCat ? ' AND p.seed_category = ANY($3::text[])' : ''}
  `, params)).rows;

  const storageUrl = (obj: string) => `${supaPublicUrl}/storage/v1/object/public/${bucket}/${obj}`;
  // = obj 보유(Storage 에 PID 이미지 있음) = PM 불필요 행 전부 → matchedIds (= 호출자 PM 대상 제외용, 헤더 의미 보존: 정상 링크 포함).
  const hasStorage = rows.filter((r: any) => r.obj);
  // = 그중 현재 image_url 이 그 Storage 를 정확히 가리키지 않는 행 = "무조건 교체" 실행 대상 (WK/NULL/OTHER/깨진 STORAGE_LINK).
  const hits = hasStorage.filter((r: any) => r.cur_url !== storageUrl(r.obj));

  // ⚠️ 2026-06-14 = 집계 의미: hit = 실제 교체대상(hits = Storage 있는데 URL 불일치) / linked = 이미 정상 링크(쓰기 0) / miss = PM 필요(Storage 없음). (§19)
  const hitIds = new Set<number>(hits.map((r: any) => r.id));
  const byCat: Record<string, { hit: number; linked: number; miss: number }> = {};
  for (const r of rows) {
    (byCat[r.cat] ??= { hit: 0, linked: 0, miss: 0 });
    if (!r.obj) byCat[r.cat].miss++;
    else if (hitIds.has(r.id)) byCat[r.cat].hit++;
    else byCat[r.cat].linked++;
  }
  // matchedIds = PM 불필요(Storage 보유) 행 전부 = 정상 링크 포함 (= PM 재호출 차단 = 비용 절감 핵심).
  const matchedIds = new Set<number>(hasStorage.map((r: any) => r.id));
  if (!apply) return { relinkable: hits.length, relinked: 0, matchedIds, byCat };

  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  let ok = 0;
  for (const r of hits) {
    try {
      const res = await upsertPlace({ cityId, seedCategory: r.cat, nameEn: r.name_en, googlePlaceId: r.pid, imageUrl: storageUrl(r.obj) });
      if (res.action === 'updated' || res.action === 'inserted') ok++;
    } catch { /* skip = 다음 단계 PM 이 잡음 */ }
  }
  return { relinkable: hits.length, relinked: ok, matchedIds, byCat };
}

// ── CLI = 직접 실행 시만(import 시 미발화) = 전 도시 일괄 재링크 ──
if ((process.argv[1] || '').replace(/\\/g, '/').endsWith('fill/storage-image-relink.ts')) {
  (async () => {
    process.chdir(ROOT);
    const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
    for (const line of envRaw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
    }
    const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
    const cityId = Number(argv['city-id'] || 0);
    const apply = argv['apply'] === 'true';
    if (!cityId) { console.error('Usage: --city-id=<N> [--apply]'); process.exit(1); }
    const pg = await import('pg');
    const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const r = await relinkStorageImages({ cityId, apply, client: c });
    console.log(`═══ storage-image-relink (city ${cityId}) = 재링크 ${apply ? r.relinked : '(dry)'} / 가능 ${r.relinkable} ═══`);
    for (const [k, v] of Object.entries(r.byCat).sort()) console.log(`  ${k}: 교체대상 ${v.hit} / 이미정상 ${v.linked} / PM필요 ${v.miss}`);
    if (!apply) console.log(`\n=== DRY (--apply 로 재링크) ===`);
    await c.end();
  })();
}

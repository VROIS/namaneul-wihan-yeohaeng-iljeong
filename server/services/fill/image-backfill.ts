// ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 사진 사후 일괄 보강 단일 진입점 (= 사진 분리 수술의 짝).
// = 생성 중 PM 0(ag3 = TS까지만) → 이미지 결손은 이 컴포넌트가 도시 단위로 한꺼번에 채움.
// = 순서(비용 최소, [[feedback_internal_first_recover]]):
//   ① PID보유+이미지결손 추출(repair.ts:99 정본 조건) → ② 무료 재링크(relinkStorageImages §16, 외부호출 0)
//   → ③ 저장 raw(docs/raw/{cityId})의 photoName 재활용 = PM만(TS 재호출 0) → ④ raw에도 없으면 보고만(기본) / --allow-ts 시 TS 1콜 후 PM.
// = 비용: PM €0.5/건 · TS €0.3/콜 (GCP 실측 단가). 기본 DRY(외부호출 0·쓰기 0) = --apply 시 실행.
// = 쓰기 = upsertPlace 단일 진입점(§14, relink 동일 패턴 = PID 매칭 = imageUrl 부분갱신 = 뼈대 보존).
// CLI: npx tsx server/services/fill/image-backfill.ts --city-id=19 [--apply] [--allow-ts] [--limit=50]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { relinkStorageImages } from './storage-image-relink';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

// ── raw 재활용 = docs/raw/{cityId} 전 json 에서 pid→photoName 수집 (§18 자산 = 재과금 0 의 근거) ──
//   지원 형태: ⓐ 06형태 모음(results[].ts = { place_id, photo_name }) ⓑ TS raw(places[] = { id: 'ChIJ..', photos[0].name })
//   ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 최신 파일 우선(§14 새것우선) = 파일명(YYYY-MM-DD_..._N) 역순 순회 + 무조건 덮어쓰기.
//     옛 "알파벳순 + !map.has(pid) 첫값고정" 폐기 = 2026-07-11 §19 = 가장 옛 photoName 채택 → 구글 로테이션으로 404 결함(리뷰 적발).
//   businessStatus 도 수집 = 영구폐업 행 PM 스킵용(2026-07-08 폐업 SSOT). photoName 없어도 businessStatus 만 기록.
export function collectPhotoNamesFromRaw(cityId: number): Map<string, { photoName?: string; status?: string }> {
  const map = new Map<string, { photoName?: string; status?: string }>();
  const dir = path.join(ROOT, 'docs', 'raw', String(cityId));
  if (!fs.existsSync(dir)) return map;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    // pid 감지 = place_id 필드, 또는 photos 배열을 동반한 문자열 id(TS raw places[] = id가 곧 PID, ChIJ 외 접두 포함)
    const pid = typeof node.place_id === 'string' ? node.place_id : (typeof node.id === 'string' && Array.isArray(node.photos) ? node.id : null);
    const pn = typeof node.photo_name === 'string' ? node.photo_name
      : (Array.isArray(node.photos) && typeof node.photos[0]?.name === 'string' ? node.photos[0].name : undefined);
    const status = typeof node.business_status === 'string' ? node.business_status
      : (typeof node.businessStatus === 'string' ? node.businessStatus : undefined);
    if (pid && (pn || status)) {
      const prev = map.get(pid) || {};
      // 역순 순회(최신 먼저)라 이미 있으면 최신값 = 유지, 없는 필드만 옛 파일에서 보충.
      map.set(pid, { photoName: prev.photoName ?? pn, status: prev.status ?? status });
    }
    for (const v of Object.values(node)) walk(v);
  };
  // 파일명 역순 = 최신(날짜·버전 큰 것) 먼저 = 최신 photoName 채택(§14)
  for (const f of fs.readdirSync(dir).sort().reverse()) {
    if (!f.endsWith('.json')) continue;
    try { walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))); } catch { /* 손상 파일 = 건너뜀 */ }
  }
  return map;
}

export async function backfillImages(opts: {
  cityId: number; apply: boolean; allowTs?: boolean; limit?: number; client: any;
}): Promise<{ targets: number; relinked: number; pmFromRaw: number; needTs: number; pmDone: number; tsDone: number }> {
  const { cityId, apply, client: c } = opts;
  const limit = opts.limit ?? 1000;

  // ② 무료 재링크 먼저 = 결제된 고아 이미지 회수 + matchedIds(=Storage 보유 = PM 불필요) 확보
  const relink = await relinkStorageImages({ cityId, apply, client: c });

  // ① 대상 = PID 보유 + 이미지 결손(repair.ts:99 정본) − Storage 보유행 − 영구폐업(2026-07-08 폐업 = PM 스킵 SSOT)
  const rows = (await c.query(`
    SELECT id, seed_category AS cat, name_en, name_local, address, latitude, longitude, google_place_id AS pid
    FROM place_seed_raw
    WHERE city_id = $1 AND google_place_id IS NOT NULL
      AND (image_url IS NULL OR image_url = '' OR image_url NOT LIKE '%place-images%')
      AND NOT (COALESCE(phase_tags, '{}') @> ARRAY['영구폐업'])
    ORDER BY rank NULLS LAST, id LIMIT $2
  `, [cityId, limit])).rows.filter((r: any) => !relink.matchedIds.has(r.id));

  // ③ raw photoName 재활용 분류 (raw businessStatus 가 폐업이면 PM 대상 제외 = 응답요소 존중 §18)
  const rawMap = collectPhotoNamesFromRaw(cityId);
  const isClosed = (r: any) => rawMap.get(r.pid)?.status === 'CLOSED_PERMANENTLY';
  const live = rows.filter((r: any) => !isClosed(r));
  const withRaw = live.filter((r: any) => rawMap.get(r.pid)?.photoName);
  const needTs = live.filter((r: any) => !rawMap.get(r.pid)?.photoName);
  const closedCnt = rows.length - live.length;
  console.log(`═══ image-backfill (city ${cityId}) ═══`);
  console.log(`대상(PID보유·이미지결손) ${rows.length}${closedCnt ? ` (폐업 ${closedCnt} 제외 → live ${live.length})` : ''} | 무료재링크 ${apply ? relink.relinked : relink.relinkable}(${apply ? '완료' : '가능'}) | raw재활용 PM ${withRaw.length}건(€${(withRaw.length * 0.5).toFixed(1)}) | TS필요 ${needTs.length}건(€${(needTs.length * 0.8).toFixed(1)}=TS+PM)`);
  if (!apply) {
    for (const r of live.slice(0, 30)) console.log(`  [${rawMap.get(r.pid)?.photoName ? 'raw→PM' : 'TS필요'}] #${r.id} ${r.name_local || r.name_en}`);
    if (needTs.length) console.log(`💡 운영(배포서버) 생성 raw 는 Storage(raw-responses)에 있음 = raw-storage-recall pull 선행 시 "TS필요"가 raw재활용으로 줄 수 있음(재과금 0).`);
    console.log(`=== DRY (외부호출 0·쓰기 0) = --apply 로 실행${needTs.length ? ', TS는 --allow-ts 필요' : ''} ===`);
    return { targets: rows.length, relinked: relink.relinkable, pmFromRaw: withRaw.length, needTs: needTs.length, pmDone: 0, tsDone: 0 };
  }

  const { tsPhoto, tsSearch } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/ts-client.ts')).href);
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
  // ⚠️ 수정금지(승인필요) 2026-07-11 = Storage 업로드 키 = SERVICE_ROLE(ts-client tsPhoto:169 요구) = ANON 아님(리뷰 적발 = ANON 없어 무성실패).
  const SUPA_SR = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const SUPA_PUB = process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL || 'https://wxebceflvuythuodemro.supabase.co';
  // 키 결손 = 사진 전건 무성실패 방지 = 시작 전 차단(과거 raw 증발 패턴 차단).
  if (!GOOGLE_KEY) throw new Error('image-backfill: GOOGLE_MAPS_API_KEY 없음 = PM 불가');
  if (!SUPA_SR) throw new Error('image-backfill: SUPABASE_SERVICE_ROLE_KEY 없음 = Storage 업로드 불가(무성실패 차단)');

  let pmDone = 0, tsDone = 0, pmFail = 0;
  const runPm = async (r: any, photoName: string) => {
    const url = await tsPhoto({ apiKey: GOOGLE_KEY, photoName, storageKey: SUPA_SR, supaPublicUrl: SUPA_PUB, pathKey: `${cityId}/${r.cat}/${r.pid}` });
    if (!url) { pmFail++; console.warn(`  ⚠️ PM null #${r.id} ${r.name_en} (photoName 만료·업로드 실패)`); return; }
    // targetRowId 직행 = PID 중복행이 있어도 정확히 그 행에 기록(§14 재매칭 불가 패턴, ag3 job2 동형)
    await upsertPlace({ targetRowId: r.id, cityId, seedCategory: r.cat, nameEn: r.name_en, googlePlaceId: r.pid, imageUrl: url });
    pmDone++;
  };
  for (const r of withRaw) {
    try { await runPm(r, rawMap.get(r.pid)!.photoName!); } catch (e) { pmFail++; console.warn(`  ⚠️ PM 실패 #${r.id}:`, (e as Error).message); }
  }
  if (opts.allowTs) {
    for (const r of needTs) {
      try {
        const tsArr = await tsSearch({
          apiKey: GOOGLE_KEY, method: 'searchText', cityId,
          nameLocal: r.name_local || r.name_en, address: r.address || undefined,
          latitude: r.latitude ? Number(r.latitude) : undefined, longitude: r.longitude ? Number(r.longitude) : undefined,
          anchorRadiusM: r.latitude ? 10 : undefined, rawTag: `img-backfill-${r.name_en || r.pid}`, localSkipRaw: false,
        });
        tsDone++;
        const ts = tsArr?.[0];
        if (!ts) continue;
        const closed = ts.businessStatus === 'CLOSED_PERMANENTLY';
        // ⚠️ §20 = 유료 TS 응답 = 전요소를 그 행에 기록(사진이름만 뽑아쓰기 = 셀렉 금지). imageUrl 은 아래 runPm 이 별도 갱신.
        //   RC = ?? null(§14 뼈대 유지, TS 무응답 시 기존 RC 보존 = autorank 강등 방지). 폐업 = phase_tags 기록 + PM 스킵.
        await upsertPlace({
          targetRowId: r.id,
          cityId, seedCategory: r.cat, nameEn: ts.nameEn || r.name_en, googlePlaceId: ts.googlePlaceId || r.pid,
          address: ts.address ?? null,
          latitude: (ts.latitude && ts.latitude !== 0) ? ts.latitude : null,
          longitude: (ts.longitude && ts.longitude !== 0) ? ts.longitude : null,
          googleMapsUri: ts.googleMapsUri ?? null, googleReviewCount: ts.googleReviewCount ?? null,
          priceEur: (ts.priceEur || 0) > 0 ? ts.priceEur : undefined,
          phaseTags: closed ? ['영구폐업'] : undefined,
        });
        if (ts.photoName && !closed) await runPm(r, ts.photoName);
      } catch (e) { console.warn(`  ⚠️ TS 실패 #${r.id}:`, (e as Error).message); }
    }
  }
  console.log(`✅ 완료: PM ${pmDone}건 저장(€${(pmDone * 0.5).toFixed(1)})${pmFail ? ` · PM 실패 ${pmFail}건` : ''} · TS ${tsDone}콜(€${(tsDone * 0.3).toFixed(1)})${!opts.allowTs && needTs.length ? ` · TS필요 ${needTs.length}건 보류(--allow-ts)` : ''}`);
  return { targets: rows.length, relinked: relink.relinked, pmFromRaw: withRaw.length, needTs: needTs.length, pmDone, tsDone };
}

// ── CLI = 직접 실행 시만(import 시 미발화) ──
if ((process.argv[1] || '').replace(/\\/g, '/').endsWith('fill/image-backfill.ts')) {
  (async () => {
    process.chdir(ROOT);
    const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
    for (const line of envRaw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
    }
    const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
    const cityId = Number(argv['city-id'] || 0);
    if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--allow-ts] [--limit=50]'); process.exit(1); }
    // @ts-ignore = pg 타입선언 없음(런타임 전용, storage-image-relink CLI 동일 패턴)
    const pg = await import('pg');
    const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await backfillImages({ cityId, apply: argv['apply'] === 'true', allowTs: argv['allow-ts'] === 'true', limit: argv['limit'] ? Number(argv['limit']) : undefined, client: c });
    await c.end();
  })();
}

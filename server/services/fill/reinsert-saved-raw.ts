// ⚠️ 수정금지(승인필요) 2026-06-11 사용자 SSOT = 저장된 raw(docs/raw/{cityId}) 전체를 PSR에 빠짐없이 재입력 (영구 = 1회용 X)
//   = 6형식 전부 처리: 01-discover(results[cat]) / 02-enrich(places, id) / 03·04-restaurant(results[tier]) / 13-restaurant(parsed, id) / 12-TS(zones[].places, PID).
//   = 모두 upsertPlace 경유(§14, 5단계 매칭) = 정리된 29컬럼에 정확히 꽂히는지 + 고아/신규 매칭 검증.
//   = 가격 4종 옛이름(estimated_price_eur/price_per_person_eur/price_eur_max) + price_eur 전부 fallback. 0 보존(?? null).
// ⚠️ 2026-06-13 사용자 승인 = 결손 배선 추가 = distance_km_from_center(raw 값 또는 도시중심 좌표 haversine, 외부호출 0) + image_url(완성형 URL 보존).
//   = 재입력 시 도심거리·이미지 결손이 실제 UPDATE 되게 = 사장님 입증 ②(결손 채움). photo_name 리소스명은 외부호출 필요라 제외.
// 호출: npx tsx server/services/fill/reinsert-saved-raw.ts --city-id=37 [--apply]
//   --apply 없으면 = dry = 파싱·매칭대상만, DB 쓰기 0.  외부호출 0 (로컬→DB).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const apply = argv['apply'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> [--apply]'); process.exit(1); }

const num = (v: any): number | undefined => (v == null || v === '' ? undefined : Number(v));
const price = (p: any): number | null => {
  const v = p.estimated_price_eur ?? p.price_per_person_eur ?? p.price_eur_max ?? p.price_eur;
  return v == null ? null : Number(v); // 0 보존
};
const parseRawText = (rt: string): any => {
  let t = (rt || '').trim();
  if (t.startsWith('```')) { t = t.replace(/^```(json)?\s*/, ''); const i = t.lastIndexOf('```'); if (i >= 0) t = t.slice(0, i); }
  return JSON.parse(t.trim());
};

// ⚠️ 2026-06-13 = 결손 배선 추가 = distC(도심거리) + imageUrl(완성형 URL 보존). 도심거리 = raw 값 우선, 없으면 좌표로 haversine(외부호출 0).
type Job = { src: string; cat?: string; id?: number; nameEn?: string; nameLocal?: string; nameKo?: string; address?: string; lat?: number; lng?: number; pid?: string; mapsUri?: string; rc?: number; priceEur: number | null; summaryKo?: string; shortformKo?: string; photoName?: string; distC?: number; imageUrl?: string };

const collect = (): Job[] => {
  const jobs: Job[] = [];
  const dir = path.join(ROOT, 'docs', 'raw', String(cityId));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.includes('pretty'))) {
    let d: any; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { continue; }
    const tag = f.split('-2026')[0].split('.')[0];
    const metaCat = d?.meta?.category; // 12-TS = meta.category (zone 응답엔 cat 없음)
    // 형식 분기
    let groups: { cat?: string; arr: any[] }[] = [];
    if (Array.isArray(d?.places)) groups = [{ arr: d.places }];                                  // 02-enrich (id, cat=DB조회)
    else if (Array.isArray(d?.parsed)) groups = [{ cat: 'restaurant', arr: d.parsed }];          // 13-restaurant (id, 식당)
    else if (Array.isArray(d?.zones)) groups = d.zones.flatMap((z: any) => [{ cat: metaCat, arr: z.places || [] }]); // 12-TS (pid, meta.category)
    else if (typeof d?.raw_text === 'string') {                                                   // 01/03/04 (raw_text)
      try { const j = parseRawText(d.raw_text); const res = j.results || j;
        if (res && typeof res === 'object') for (const [cat, arr] of Object.entries(res)) if (Array.isArray(arr)) groups.push({ cat, arr });
      } catch { /* skip */ }
    }
    for (const g of groups) for (const p of g.arr) {
      if (!p || typeof p !== 'object') continue;
      jobs.push({
        src: tag, cat: g.cat || p.seed_category || p.price_tier,
        id: num(p.id), nameEn: p.name_en || p.name, nameLocal: p.name_local, nameKo: p.name_ko,
        address: p.address || p.formattedAddress, lat: num(p.lat ?? p.latitude), lng: num(p.lng ?? p.longitude),
        pid: p.place_id || p.google_place_id, mapsUri: p.google_maps_uri || p.googleMapsUri,
        rc: num(p.review_count ?? p.userRatingCount ?? p.google_review_count),
        priceEur: price(p), summaryKo: p.summary_ko || p.selection_reason_ko, shortformKo: p.editorial_summary || p.shortform_ko,
        photoName: p.photo_name,
        // ⚠️ 2026-06-13 = 도심거리 = raw 값 우선(없으면 main 에서 좌표로 haversine), 이미지 = 완성형 URL 만(photo_name 리소스명은 외부호출 필요라 제외)
        distC: num(p.distance_km_from_center) ?? undefined,
        imageUrl: (p.image_url && /^https?:/.test(String(p.image_url))) ? String(p.image_url) : undefined,
      });
    }
  }
  return jobs;
};

(async () => {
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  // ⚠️ 2026-06-13 = 도심거리 계산 = 단일 SSOT haversineKm 재사용 (= 헌법 §16 재발명 금지)
  const { haversineKm } = await import(pathToFileURL(path.join(ROOT, 'server/services/agents/transit-haversine.ts')).href);
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // ⚠️ 2026-06-13 = 도시 중심좌표 = 도심거리 결손 보강용 (raw 에 distance_km_from_center 없으면 좌표로 계산 = 외부호출 0, 사장님 "도심거리 무조건 저장")
  const cityRow = (await c.query('SELECT latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1', [cityId])).rows[0];

  const jobs = collect();
  // 도심거리 결손 보강 = raw 에 없고 좌표 있으면 = haversine(도시중심, 장소좌표) = 외부호출 0
  if (cityRow?.lat != null) {
    for (const j of jobs) {
      if (j.distC == null && j.lat != null && j.lng != null) {
        j.distC = Math.round(haversineKm(cityRow.lat, cityRow.lng, j.lat, j.lng) * 10) / 10;
      }
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-06-11 = id 보유 raw(02-enrich/13-restaurant) = DB 기존 행의 "검증된 식별 앵커"로 upsert
  //   = 옛 버그: raw 의 Gemini 식별자(name/주소 부정확)로 매칭 → 197곳 신규 누수. 이제 PID/주소/cat = DB 것 = 1·3순위 확정 병합.
  //   = 콘텐츠(가격/요약/이름갱신)만 raw 것 = "id가 가리키는 행을 보강한다"의 정확한 구현.
  const RTIER = new Set(['economic', 'reasonable', 'premium', 'luxury', 'low', 'mid', 'high']);
  const idList = jobs.filter((j) => j.id != null).map((j) => j.id!);
  if (idList.length) {
    const idRows = (await c.query(
      `SELECT id, seed_category, name_en, name_local, address, latitude, longitude, google_place_id, google_maps_uri
       FROM place_seed_raw WHERE id = ANY($1::int[])`, [idList]
    )).rows;
    const idMap = new Map<number, any>(idRows.map((r: any) => [r.id, r]));
    for (const j of jobs) {
      if (j.id != null && !idMap.has(j.id)) { (j as any).deadId = true; continue; } // ⚠️ 2026-06-11 = 죽은 id(과거 정리로 삭제된 행) 보강 raw = 부활 금지 (Tanatorio M30 사고)
      const b = j.id != null ? idMap.get(j.id) : undefined;
      if (!b) continue;
      j.cat = b.seed_category;                                   // cat = DB 행 (tier 오염 원천 차단)
      j.pid = b.google_place_id ?? j.pid;                        // 식별 앵커 = DB (1순위 확정)
      j.mapsUri = b.google_maps_uri ?? j.mapsUri;                // (2순위)
      j.address = b.address ?? j.address;                        // (3순위 확정 = DB 주소)
      j.nameEn = j.nameEn || b.name_en;                          // ⚠️ 2026-06-11 = 13-batch3·4(요약+가격만, 이름 無 80곳) = DB 이름으로 보완
      j.nameLocal = j.nameLocal || b.name_local;                 // 로컬이름 = raw 우선(갱신), 없으면 DB (4순위)
      if (j.lat == null && b.latitude != null) { j.lat = Number(b.latitude); j.lng = Number(b.longitude); }
    }
  }
  for (const j of jobs) { if (j.cat && RTIER.has(j.cat)) j.cat = 'restaurant'; }
  // ⚠️ 2026-06-11 = 12-TS 中 meta.category="" 파일(text/premium/nearby 실험 140곳) = cat 부재
  //   = PID 로 DB 행 lookup → 그 행의 cat 사용(= 매칭·갱신 흡수). DB 에 없는 PID = cat 발명 금지 = skip 유지 (로그로 노출).
  const noCatPids = [...new Set(jobs.filter((j) => !j.cat && j.pid).map((j) => j.pid!))];
  if (noCatPids.length) {
    const pidRows = (await c.query(
      `SELECT google_place_id, seed_category FROM place_seed_raw WHERE google_place_id = ANY($1::text[])`, [noCatPids]
    )).rows;
    const pidCat = new Map<string, string>(pidRows.map((r: any) => [r.google_place_id, r.seed_category]));
    for (const j of jobs) { if (!j.cat && j.pid && pidCat.has(j.pid)) j.cat = pidCat.get(j.pid); }
  }
  const before = (await c.query(`SELECT count(*)::int AS n, count(price_eur)::int AS p, count(*) FILTER (WHERE price_eur=0)::int AS z FROM place_seed_raw WHERE city_id=$1`, [cityId])).rows[0];
  console.log(`\n═══ reinsert-saved-raw (city=${cityId}, raw job ${jobs.length}곳) ${apply ? '[APPLY]' : '[DRY]'} ═══`);
  console.log(`  [전] PSR 행=${before.n} / 가격보유=${before.p} / €0무료=${before.z}`);
  const bySrc: Record<string, number> = {};
  for (const j of jobs) bySrc[j.src] = (bySrc[j.src] || 0) + 1;
  console.log('  raw 소스별:', Object.entries(bySrc).map(([k, v]) => `${k}=${v}`).join(' '));
  const zeroN = jobs.filter((j) => j.priceEur === 0).length;
  console.log(`  raw 가격=0(무료): ${zeroN}곳 (= 0 보존 검증대)`);

  const action: Record<string, number> = {};
  if (apply) {
    // ⚠️ 2026-06-11 = 신규/skip 사유 전수 로그 (= "빠짐없이" 검증 = 신규0 목표 추적용)
    const insertedLog: string[] = [];
    const skipLog: Record<string, number> = {};
    for (const j of jobs) {
      if ((j as any).deadId) { action.skip = (action.skip || 0) + 1; skipLog['dead_id'] = (skipLog['dead_id'] || 0) + 1; continue; }
      if (!j.cat || (!j.id && !j.pid && !j.nameEn)) {
        action.skip = (action.skip || 0) + 1;
        const why = !j.cat ? `no_cat:${j.src}` : `no_identity:${j.src}`;
        skipLog[why] = (skipLog[why] || 0) + 1;
        continue;
      }
      try {
        const r = await upsertPlace({
          cityId, seedCategory: j.cat,
          nameEn: j.nameEn, nameLocal: j.nameLocal, nameKo: j.nameKo,
          address: j.address, latitude: j.lat, longitude: j.lng,
          googlePlaceId: j.pid, googleMapsUri: j.mapsUri, googleReviewCount: j.rc,
          priceEur: j.priceEur, selectionReasonKo: j.summaryKo, shortformKo: j.shortformKo,
          // ⚠️ 2026-06-13 = 결손 배선 = 도심거리(raw 또는 haversine 계산) + 이미지(완성형 URL 보존) = place-upsert COALESCE 새우선
          distanceKmFromCenter: j.distC, imageUrl: j.imageUrl,
        });
        action[r?.action || 'done'] = (action[r?.action || 'done'] || 0) + 1;
        if (r?.action === 'inserted') insertedLog.push(`${j.src} | ${j.nameEn}${r?.suspect ? ' [중복의심]' : ' [진짜신규]'}`);
        if (r?.action === 'skipped') skipLog[`upsert:${r?.reason || 'unknown'}`] = (skipLog[`upsert:${r?.reason || 'unknown'}`] || 0) + 1;
      } catch (e: any) { action.error = (action.error || 0) + 1; if ((action.error || 0) <= 3) console.warn(`   err ${j.nameEn}: ${e?.message?.slice(0, 80)}`); }
    }
    if (insertedLog.length) { console.log(`  ─ 신규 INSERT ${insertedLog.length}곳 전수:`); for (const l of insertedLog) console.log(`    + ${l}`); }
    if (Object.keys(skipLog).length) console.log('  ─ skip 사유:', Object.entries(skipLog).map(([k, v]) => `${k}=${v}`).join(' '));
    const after = (await c.query(`SELECT count(*)::int AS n, count(price_eur)::int AS p, count(*) FILTER (WHERE price_eur=0)::int AS z FROM place_seed_raw WHERE city_id=$1`, [cityId])).rows[0];
    console.log('  upsert 결과:', Object.entries(action).map(([k, v]) => `${k}=${v}`).join(' '));
    console.log(`  [후] PSR 행=${after.n}(${after.n - before.n >= 0 ? '+' : ''}${after.n - before.n}) / 가격보유=${after.p}(+${after.p - before.p}) / €0무료=${after.z}(+${after.z - before.z})`);
  } else {
    console.log(`  [DRY] --apply 시 upsertPlace ${jobs.length}곳 (id/pid/name 매칭 후 갱신 or 신규)`);
  }
  await c.end();
})();

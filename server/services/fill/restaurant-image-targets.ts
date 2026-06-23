// ⚠️ 영구 컴포넌트 2026-06-09 = 사용자 SSOT = 식당 FE 이미지 노출 선정 + PM (FILLCITY_PRD §8.2)
// = 선정: 도심 20/40/20(eco/reason/prem+lux) + 외곽 자격 town(식당 ≥6)×2/4/2, 각 tier RC DESC.
//   띠 경계 = 그 도시·구역 가격 분포 백분위(하위25/중간50/상위25 = 우리 데이터 실분포, 외부지표 X = §8.2②).
// = 2분기: PID 있음 → 바로 PM(검증된 곳 재검색 위험 0) / PID 없음 → TS searchText 검증(PID·RC 획득) 후 PM.
// = dedup: 선정셋 내 matchCandidate 확정중복 = keep 1행만 PM(삭제 0 = skip만, BTS/비식당 keep 보존) = PM 최소화(§3/§4 게이트).
// = 6 비식당은 ts-photo-fill 담당(형제 = 같은 tsSearch→tsPhoto→upsertPlace 라인). 본 컴포넌트 = 식당 전용.
// 호출: npx tsx server/services/fill/restaurant-image-targets.ts --city-id=37 [--apply] [--lang=es]
//   (--apply 없으면 = DRY = 선정·분기·dedup 카운트 + 명단, TS/PM 호출 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const apply = argv['apply'] === 'true';
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 명시 시에만 사용, 미지정 = undefined(ts-client 가 키 생략 = 한국어 강제 안 함)
const lang = argv['lang'] ? String(argv['lang']) : undefined;
if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--lang=es]'); process.exit(1); }

const ANCHOR_M = 10; // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 좌표 앵커 무조건 10m(매칭기준 동일=도심밀집 환각차단). 옛 100m AI임의 폐기(§19).
// §8.2 ③ quota = 1:2:1 (= 백분위 25/50/25 와 일치)
const DOWNTOWN: Record<string, number> = { eco: 20, reason: 40, prem: 20 }; // 도심 총 80
const OUTSKIRT: Record<string, number> = { eco: 2, reason: 4, prem: 2 };     // 외곽 town당 8
const OUTSKIRT_MIN = 6; // 외곽 자격 = 식당 ≥6곳 town (1~3곳 잡음 town 제외)

// 주소 → town (= outskirt-ts-fill.townOf 동일 로직; 스크립트라 import 불가 = 추후 shared/town-extract 통합 TODO §16)
function townOf(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  for (const seg of parts) { const m = seg.match(/^\d{4,6}\s+(.+)$/); if (m && m[1].trim().length >= 2) return m[1].trim(); }
  const town = (parts[parts.length - 2] || '').replace(/^\d[\d\s-]{2,8}\s*/, '').trim();
  return town.length >= 2 && !/^\d+$/.test(town) ? town : null;
}

// 백분위 경계 = 정렬 후 인덱스(보간 없음). p25/p75 = 우리 데이터 실분포(§8.2②).
function pct(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[i];
}

// ⚠️ 2026-06-11 = best_image_url/photo_urls 폐기 = 이미지 image_url(구글 PM) 1종 통일
// ⚠️ 2026-06-12 = 이미지 결손 = NULL OR WK(위키미디어) = 사용자 SSOT (WK = 환각 오노출 = 파리 식당에 외부 URL, [[feedback_image_matching_polite_failure]]).
//   = Google Photo + Storage 만 안전 = WK 도 Google 로 교체. (옛 = NULL 만 = WK 환각 방치.)
const imgMissing = (r: any): boolean => !r.image_url || /wiki/i.test(r.image_url);
const num = (v: any): number | null => (v == null ? null : Number(v));

(async () => {
  const { matchCandidate } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/matcher.ts')).href);
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country_code FROM cities WHERE id=$1', [cityId])).rows[0];
  if (!city) { await c.end(); console.error(`✗ city ${cityId} 미존재`); process.exit(1); }

  const rows = (await c.query(
    `SELECT id, city_id AS "cityId", name_en AS "nameEn", name_local AS "nameLocal", name_ko AS "nameKo",
            address, latitude::float8 AS lat, longitude::float8 AS lng, day_zone AS zone, price_eur AS price,
            google_place_id AS "googlePlaceId", google_maps_uri AS "googleMapsUri",
            google_review_count AS rc, image_url
     FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant'`, [cityId])).rows;

  // 1) 백분위 띠 경계 (구역별 = 도심·외곽 분포 분리, §8.2②)
  const pricesOf = (zone: string) => rows.filter((r: any) => r.zone === zone && r.price != null).map((r: any) => Number(r.price)).sort((a: number, b: number) => a - b);
  const coreP = pricesOf('core'), outP = pricesOf('outskirt');
  const bound = { core: [pct(coreP, 0.25), pct(coreP, 0.75)], outskirt: [pct(outP, 0.25), pct(outP, 0.75)] };
  const tierOf = (r: any): 'eco' | 'reason' | 'prem' | null => {
    if (r.price == null) return null;
    const b = bound[r.zone as 'core' | 'outskirt'] || bound.core;
    return Number(r.price) <= b[0] ? 'eco' : Number(r.price) <= b[1] ? 'reason' : 'prem';
  };

  // 2) 선정 = 도심 20/40/20 + 외곽 자격 town × 2/4/2 (각 tier RC DESC NULLS LAST)
  const byRc = (a: any, b: any) => (b.rc ?? -1) - (a.rc ?? -1) || a.id - b.id;
  const pickTier = (pool: any[], tier: string, quota: number) =>
    pool.filter((r) => tierOf(r) === tier).sort(byRc).slice(0, quota);
  const selected: any[] = [];
  const core = rows.filter((r: any) => r.zone === 'core');
  for (const [t, q] of Object.entries(DOWNTOWN)) selected.push(...pickTier(core, t, q));

  const outs = rows.filter((r: any) => r.zone === 'outskirt');
  const townCount = new Map<string, number>();
  for (const r of outs) { (r as any)._town = townOf(r.address); if ((r as any)._town) townCount.set((r as any)._town, (townCount.get((r as any)._town) || 0) + 1); }
  const qTowns = [...townCount.entries()].filter(([, n]) => n >= OUTSKIRT_MIN).map(([t]) => t);
  for (const town of qTowns)
    for (const [t, q] of Object.entries(OUTSKIRT)) selected.push(...pickTier(outs.filter((r: any) => (r as any)._town === town), t, q));

  // 3) dedup-skip = 선정셋 내 확정중복(matchCandidate INVARIANT) = keep 1행만(PID>RC>rank), 나머지 skip (삭제 X)
  const keepScore = (r: any) => (r.googlePlaceId ? 1000000 : 0) + (r.rc ?? 0); // keep = PID 보유 > RC 높음
  const skip = new Set<number>();
  for (let i = 0; i < selected.length; i++) {
    if (skip.has(selected[i].id)) continue;
    for (let j = i + 1; j < selected.length; j++) {
      if (skip.has(selected[j].id)) continue;
      const r = matchCandidate(selected[i], [selected[j]]);
      if (r.tier === 'confirmed') {
        const loser = keepScore(selected[i]) >= keepScore(selected[j]) ? selected[j] : selected[i];
        skip.add(loser.id);
      }
    }
  }
  const finalSel = selected.filter((r) => !skip.has(r.id));

  // ⚠️ 수정금지(승인필요) 2026-06-10 = PM(유료) 전 Storage 무료 재링크 = 결제된 고아 이미지 재활용 (storage-image-relink, §16)
  const { relinkStorageImages } = await import(pathToFileURL(path.join(ROOT, 'server/services/fill/storage-image-relink.ts')).href);
  const relink = await relinkStorageImages({ cityId, apply, client: c, categories: ['restaurant'] });
  if (relink.relinkable) console.log(`[재링크] 식당 storage 매칭 ${relink.relinkable} ${apply ? `= ${relink.relinked} 무료 채움` : '(--apply 시 무료)'} → PM 제외`);

  // 4) 이미지 결손 → 2분기 (PID 있음 = 바로 PM / 없음 = TS검증+PM) — 재링크된 행은 제외
  const missing = finalSel.filter((r) => imgMissing(r) && !relink.matchedIds.has(r.id));
  const pmDirect = missing.filter((r) => r.googlePlaceId);   // PID 있음
  const tsThenPm = missing.filter((r) => !r.googlePlaceId);  // PID 없음

  console.log(`═══ restaurant-image-targets (city ${cityId} ${city.name_en}) ═══`);
  console.log(`백분위 띠경계 = 도심[p25 €${bound.core[0]} / p75 €${bound.core[1]}] · 외곽[p25 €${bound.outskirt[0]} / p75 €${bound.outskirt[1]}]`);
  console.log(`자격 외곽 town(≥${OUTSKIRT_MIN}) = ${qTowns.length}개: ${qTowns.join(', ')}`);
  console.log(`선정 ${selected.length} → dedup skip ${skip.size} → 최종 ${finalSel.length}`);
  console.log(`이미지 결손 ${missing.length} = 바로 PM(PID有) ${pmDirect.length} + TS검증후 PM(PID無) ${tsThenPm.length}`);
  console.log(`예상 비용 ≈ PM ${missing.length}×€0.037 + TS검증 ${tsThenPm.length}×€0.0299 = €${(missing.length * 0.037 + tsThenPm.length * 0.0299).toFixed(2)}`);
  if (tsThenPm.length) console.log(`  [TS검증후 PM] ${tsThenPm.map((r) => r.nameLocal || r.nameEn).join(' / ')}`);

  if (!apply) { console.log(`\n=== DRY (--apply 로 PM 실행) ===`); await c.end(); return; }

  // 5) PM 집행 (--apply) = TS검증(필요시) → tsPhoto → upsertPlace(imageUrl)
  const { tsSearch, tsPhoto } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/ts-client.ts')).href);
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (= 직독·process.env 폴백 폐기). 식당 이미지 채움 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const today = new Date().toISOString().slice(0, 10);
  const { issueApiKey } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/issue-api-key.ts')).href);
  const KEY = await issueApiKey(c, 'GOOGLE_MAPS_API_KEY', cityId, today, true);
  const supaPublicUrl = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!KEY || !storageKey) { await c.end(); console.error(`✗ KEY/Storage 설정 미비 = 업로드 불가`); process.exit(1); }

  let filled = 0, noPhoto = 0, err = 0;
  const report: string[] = [];
  for (const row of missing) {
    try {
      const ts = await tsSearch({
        apiKey: KEY, method: 'searchText', regionCode: city.country_code || 'ES', languageCode: lang,
        cityId, rawTag: `restimg-${row.nameLocal || row.nameEn || row.id}`,
        nameLocal: row.nameLocal || row.nameEn, address: row.address,
        latitude: num(row.lat), longitude: num(row.lng), anchorRadiusM: row.lat != null ? ANCHOR_M : undefined, maxResults: 1,
      });
      const top = ts[0];
      if (!top || !top.photoName) { noPhoto++; report.push(`  ✗ 사진없음: ${row.nameLocal || row.nameEn}`); continue; }
      const imageUrl = await tsPhoto({ apiKey: KEY, photoName: top.photoName, storageKey, supaPublicUrl, pathKey: `${cityId}/restaurant/${row.googlePlaceId || top.googlePlaceId || row.id}`, maxWidthPx: 800 });
      if (!imageUrl) { err++; report.push(`  ✗ 업로드실패: ${row.nameLocal || row.nameEn}`); continue; }
      const r = await upsertPlace({
        // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
        cityId, seedCategory: 'restaurant', nameEn: top.nameEn || row.nameEn, nameLocal: null, address: top.address || row.address,
        latitude: num(row.lat) ?? top.latitude, longitude: num(row.lng) ?? top.longitude,
        googlePlaceId: row.googlePlaceId || top.googlePlaceId || null, googleMapsUri: top.googleMapsUri,
        googleReviewCount: top.googleReviewCount, priceEur: top.priceEur, priceOverwrite: false, imageUrl, dayZone: row.zone,
      });
      if (r.action === 'updated' || r.action === 'inserted') { filled++; report.push(`  ✓ ${row.nameLocal || row.nameEn} (${r.action}/${r.matchedBy})`); }
      else { err++; report.push(`  ⚠️ ${row.nameLocal || row.nameEn} = ${r.action}(${r.matchedBy})`); }
    } catch (e: any) { err++; report.push(`  ✗ ERR ${row.nameLocal || row.nameEn}: ${e.message}`); }
  }
  await c.end();
  console.log(report.join('\n'));
  console.log(`\n═══ 결과 = 이미지채움 ${filled} / 사진없음 ${noPhoto} / 실패 ${err} ═══`);
})();

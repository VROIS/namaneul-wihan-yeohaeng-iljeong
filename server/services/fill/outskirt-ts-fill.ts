// ⚠️ 영구 컴포넌트 2026-06-08 = 사용자 SSOT = 외곽 식당 town 자동 시스템화 (= destinations.ts 폐기, FILLCITY_PRD §8.1)
// = Gemini 04 발굴 외곽식당(day_zone='outskirt') 주소에서 town 추출 → top-N town → TS geocode → searchNearby POP → upsertPlace
// = 입력 = DB(Gemini 발굴) / 좌표 = TS geocode(searchText) / 풀 = searchNearby POPULARITY(카탈로그 #26/#32 표준) / 쓰기 = upsertPlace(§14)
// = 도시별 수동 config(destinations.ts) 불필요 = 도시명만으로 자동 = 범용.
// 호출: npx tsx server/services/fill/outskirt-ts-fill.ts --city-id=37 [--apply] [--top=5] [--radius=8000] [--per=20] [--lang=es]
//   (--apply 없으면 = DRY = town 추출 + top-N + 비용추정, TS 호출 0)
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
const topN = Number(argv['top'] || 5);
const radiusM = Number(argv['radius'] || 8000);
const per = Number(argv['per'] || 20);
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 명시 시에만 사용, 미지정 = undefined(ts-client 가 키 생략 = 한국어 강제 안 함)
const lang = argv['lang'] ? String(argv['lang']) : undefined;
if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--top=5] [--radius=8000] [--per=20] [--lang=es]'); process.exit(1); }

// 주소 → town 추출 = 표준 "..., 우편번호 town, 국가" = 국가 직전 세그먼트 - 우편번호 (= 범용, 지명 하드코딩 0)
function townOf(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // ⚠️ 우편번호+town 세그먼트 우선 (= "28232 Las Rozas" → "Las Rozas", 위치 무관 = 4세그먼트 주(Madrid) 오인 방지)
  for (const seg of parts) {
    const m = seg.match(/^\d{4,6}\s+(.+)$/);
    if (m && m[1].trim().length >= 2) return m[1].trim();
  }
  // 폴백 = 국가 직전 세그먼트 - 우편번호
  const town = (parts[parts.length - 2] || '').replace(/^\d[\d\s-]{2,8}\s*/, '').trim();
  return town.length >= 2 && !/^\d+$/.test(town) ? town : null;
}

(async () => {
  const { tsSearch } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/ts-client.ts')).href);
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country, country_code FROM cities WHERE id=$1', [cityId])).rows[0];
  if (!city) { await c.end(); console.error(`✗ city ${cityId} 미존재`); process.exit(1); }
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (= 직독 폐기). 외곽식당 보충 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const today = new Date().toISOString().slice(0, 10);
  const KEY = (await c.query(
    `SELECT public.issue_api_key('GOOGLE_MAPS_API_KEY', $1, $2, true) AS k`,
    [cityId, today],
  )).rows[0]?.k;
  if (!KEY) { await c.end(); console.error('Google key 미존재'); process.exit(1); }
  const REGION = city.country_code || 'ES';
  const countrySuffix = city.country ? `, ${city.country}` : '';

  // 1. 외곽 식당(Gemini 발굴) 주소 → town 추출 + 식당수 집계 (= 한국선호 강도)
  const rows = (await c.query(
    `SELECT address FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant' AND day_zone='outskirt'`, [cityId])).rows;
  const cityNorm = String(city.name_en || '').trim().toLowerCase();
  const byTown = new Map<string, number>();
  for (const r of rows) {
    const t = townOf(r.address);
    if (t && t.trim().toLowerCase() !== cityNorm) byTown.set(t, (byTown.get(t) || 0) + 1);  // = 도심 도시명 제외 = 외곽 town 만
  }
  const ranked = [...byTown.entries()].sort((a, b) => b[1] - a[1]);
  const topTowns = ranked.slice(0, topN);

  console.log(`═══ outskirt-ts-fill (city ${cityId} ${city.name_en}) ═══`);
  console.log(`외곽 식당 ${rows.length}곳 → town ${ranked.length}개 추출 → top${topN} 선정:`);
  topTowns.forEach(([t, n], i) => console.log(`  ${i + 1}. ${t} (${n}식당)`));
  const estCalls = topTowns.length * 2;
  console.log(`예상 TS = ${estCalls}콜 (geocode+searchNearby) ≈ €${(estCalls * 0.0299).toFixed(2)}`);

  if (!apply) { console.log(`\n=== DRY (--apply 로 실행) ===`); await c.end(); return; }

  // 2. top town 별 = geocode(중심좌표) → searchNearby POP(20) → upsertPlace
  let inserted = 0, updated = 0, skipped = 0, geoFail = 0, errors = 0;
  for (const [town, n] of topTowns) {
    try {
      // 2a. geocode = town 중심좌표 (= TS searchText, 카탈로그 표준)
      const geo = await tsSearch({ apiKey: KEY, method: 'searchText', regionCode: REGION, languageCode: lang, cityId, rawTag: `outskirt-geocode-${town}`, textQuery: `${town}${countrySuffix}`, maxResults: 1 });
      const center = geo[0];
      if (!center || center.latitude == null) { geoFail++; console.log(`  ✗ geocode 실패: ${town}`); continue; }
      // 2b. searchNearby POPULARITY (= 검색어 없음 = 순수 인기순 = 카탈로그 #26/#32 표준)
      const pool = await tsSearch({
        apiKey: KEY, method: 'searchNearby', regionCode: REGION, languageCode: lang,
        cityId, rawTag: `outskirt-pool-${town}`,
        includedTypes: ['restaurant'], latitude: center.latitude, longitude: center.longitude,
        circleRadiusM: radiusM, maxResults: per,
      });
      // 2c. upsertPlace (= 7단계 매칭 → Gemini행 백필 or 신규)
      let ins = 0, upd = 0, skp = 0;
      for (const p of pool) {
        const r = await upsertPlace({
          cityId, seedCategory: 'restaurant',
          // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
          nameEn: p.nameEn, nameLocal: null, address: p.address,
          latitude: p.latitude, longitude: p.longitude,
          googlePlaceId: p.googlePlaceId, googleMapsUri: p.googleMapsUri,
          googleReviewCount: p.googleReviewCount, priceEur: p.priceEur, priceOverwrite: false,
          dayZone: 'outskirt', phaseTags: ['ts-searchnearby', `outskirt-ts-${today}`],
        });
        if (r.action === 'inserted') ins++; else if (r.action === 'updated') upd++; else skp++;
      }
      inserted += ins; updated += upd; skipped += skp;
      console.log(`  ✓ ${town} (${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}) → searchNearby ${pool.length}곳 = 신규+${ins} 병합${upd} skip${skp}`);
    } catch (e: any) { errors++; console.log(`  ✗ ERR ${town}: ${e.message}`); }
  }
  await c.end();
  console.log(`\n═══ 결과 = 신규 ${inserted} / 병합(백필) ${updated} / skip ${skipped} / geocode실패 ${geoFail} / err ${errors} ═══`);
})();

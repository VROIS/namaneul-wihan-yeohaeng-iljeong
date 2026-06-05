// ⚠️ 수정금지(승인필요) 2026-06-02 = ts-discover-pool 발굴 진입점 (= 명소별 TS discovery → 리뷰순 raw)
// = STANDARD_TS_FIELD_MASK (9필드 Enterprise, validateFieldMask 강제) + includedType=restaurant + circle + languageCode=ko
// = 과금 = 요청당 (per-request) = 명소당 1콜 = ~20곳 (= reference_ts_batch_discovery 메모리)
// = 산출물: docs/raw/{cityId}/12-ts-discover-{zone}-{YYYY-MM-DD}.json (= DB 안 건드림 = dry)
// 호출:
//   npx tsx .claude/skills/raw-db-verify-and-complete/prompts/12-ts-discover-pool/run.ts --city-id=19 [--zone=outskirt] [--per=20]
// 다음 = post-process.ts (= OPERATIONAL 필터 + PhotoMedia + upsertPlace 5단계 + 07-merge-dups)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DISCOVERY_ZONES } from './destinations';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const zone = String(argv['zone'] || 'outskirt');
const per = Number(argv['per'] || 20);
// ⚠️ 수정금지(승인필요) 2026-06-02 = 페이지네이션 = nextPageToken 으로 pages 회 수집 (= 시내 TOP100 = 20×5)
const maxPages = Number(argv['pages'] || 1); // = 외곽 기본 1 (= 동작 보존) / 시내 = --pages=5
// ⚠️ 수정금지(승인필요) 2026-06-02 = 검색 방식 = text(searchText 관련성·최대60) | nearby(searchNearby POPULARITY 인기순·최대20)
const method = String(argv['method'] || 'text');
// ⚠️ 수정금지(승인필요) 2026-06-03 = 카테고리 모드 = 01-discover-6cats 정의를 textQuery 로 그대로 (= 타입 fabricate 금지 = 사용자 SSOT). searchText 전용.
const CATEGORY_QUERIES: Record<string, string> = {
  heritage: 'historical sites and museums',
  hotspot: 'photogenic viewpoints, panoramic photo spots',
  attraction: 'theme parks, zoos, aquariums',
  adventure: 'adventure places and activity spots',
  healing: 'parks, gardens, peaceful nature',
  shopping: 'shopping places and markets',
};
const category = argv['category'] ? String(argv['category']) : '';
// ⚠️ 수정금지(승인필요) 2026-06-03 = 쿼리 오버라이드 = 카테고리 정의 대신 임의 검색어 실측용 (예 --query="Rooftop"). category 없이도 searchText 발굴.
const queryOverride = argv['query'] ? String(argv['query']) : '';
const catMode = !!(category || queryOverride);  // = searchText 정의/쿼리 모드 (= 식당 textQuery 아님 + includedType 강제 X)
const effQuery = queryOverride || (category ? CATEGORY_QUERIES[category] : '');  // = 실제 보낼 textQuery
// ⚠️ 수정금지(승인필요) 2026-06-02 = 합본 발굴 = label(출력파일 변형 = nearby/text/premium 안 덮어씀) + price-levels(searchText 가격필터 = Premium)
const label = argv['label'] ? String(argv['label']) : (category || (queryOverride ? queryOverride.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) : ''));
const priceLevels = argv['price-levels'] ? String(argv['price-levels']).split(',').map((s) => `PRICE_LEVEL_${s.trim().toUpperCase()}`) : null;
// ⚠️ 수정금지(승인필요) 2026-06-02 = 카테고리 모드 = searchNearby includedTypes 지정 (= 비식당 6카테고리 검증·발굴). 기본 restaurant 보존.
const includedTypes = argv['included-types'] ? String(argv['included-types']).split(',').map((s) => s.trim()).filter(Boolean) : ['restaurant'];
// ⚠️ 수정금지(승인필요) 2026-06-03 = 반경 오버라이드 = PSR 스코프 맞춤. 카테고리(searchText)=강제 사각형(locationRestriction, 크기제한 없음)=도심 100km(PSR day-trip). searchNearby 원형은 API 하드캡 50000(아래 Math.min 클램프).
const radiusOverride = argv['radius'] ? Number(argv['radius']) : (catMode ? 100000 : null);
// ⚠️ 수정금지(승인필요) 2026-06-03 = displayName 언어 = 식당 'ko'(SSOT) / 카테고리는 name_local(현지명=프랑스어 등) 위해 현지어 명시 (예 Paris=--lang=fr). 미지정 = 'ko'.
const lang = argv['lang'] ? String(argv['lang']) : 'ko';
if (!cityId) { console.error('Usage: --city-id=<N> [--zone=outskirt|downtown] [--per=20] [--pages=1] [--method=text|nearby] [--label=x] [--price-levels=EXPENSIVE,VERY_EXPENSIVE] [--included-types=observation_deck,...] [--radius=50000] [--category=heritage|hotspot|attraction|adventure|healing|shopping]'); process.exit(1); }
if (category && !CATEGORY_QUERIES[category]) { console.error(`--category 는 ${Object.keys(CATEGORY_QUERIES).join('|')} 중 하나`); process.exit(1); }

const priceTier = (p: number | null) =>
  p == null ? 'unknown' : p <= 24 ? 'eco' : p <= 60 ? 'reason' : p <= 180 ? 'premium' : 'luxury';

// ⚠️ 수정금지(승인필요) 2026-06-03 = 중심+반경(km) → 강제 사각형(rectangle viewport) = searchText locationRestriction 용 (= 범위 밖 전세계 누수 차단). 사각형은 크기제한 없음(공식문서).
const rectFromCenter = (lat: number, lng: number, km: number) => {
  const latD = km / 111;
  const lngD = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { low: { latitude: lat - latD, longitude: lng - lngD }, high: { latitude: lat + latD, longitude: lng + lngD } };
};

(async () => {
  const { STANDARD_TS_FIELD_MASK, validateFieldMask } =
    await import(pathToFileURL(path.join(ROOT, 'server/services/shared/google-places-sku.ts')).href);
  validateFieldMask(STANDARD_TS_FIELD_MASK); // = Atmosphere 차단 §15

  const dests = DISCOVERY_ZONES[cityId]?.[zone];
  if (!dests?.length) { console.error(`city ${cityId} zone '${zone}' 명소 config 없음 = destinations.ts 추가 필요`); process.exit(1); }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country_code FROM cities WHERE id=$1', [cityId])).rows[0];
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name IN ('GOOGLE_MAPS_API_KEY','GOOGLE_PLACES_API_KEY') AND is_active=true ORDER BY key_name LIMIT 1`)).rows[0];
  await c.end();
  const KEY = keyRow?.key_value || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!KEY) { console.error('Google key 미존재 = api_keys DB 확인'); process.exit(1); }

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  const callsPerDest = method === 'nearby' ? 1 : maxPages;
  console.log(`═══ ts-discover-pool (city=${cityId} ${city?.name_en}, zone=${zone}, method=${method}${catMode ? (category ? ' category=' + category : '') + ' q="' + effQuery + '"' : ''}${label ? ' label=' + label : ''}${priceLevels ? ' price=' + priceLevels.join('+') : ''}, ${dests.length} 명소 × ${callsPerDest}) ═══`);
  console.log(`마스크 = Enterprise (validateFieldMask 통과) / 예상 = 최대 ${dests.length * callsPerDest} 콜 × €0.0299 = €${(dests.length * callsPerDest * 0.0299).toFixed(2)} (= 무료 1K/월)\n`);

  // ⚠️ 수정금지(승인필요) 2026-06-02 = 검색 2종 = text(searchText 관련성·페이지네이션 최대60) | nearby(searchNearby POPULARITY 인기순·최대20·페이지네이션 없음)
  //   = searchText 페이지네이션은 FieldMask 에 'nextPageToken' 명시 필요 (= SKU 무관 = 무료) / nearby 는 nextPageToken 없음
  const isNearby = method === 'nearby';
  const endpoint = isNearby ? 'places:searchNearby' : 'places:searchText';
  // ⚠️ 수정금지(승인필요) 2026-06-02 = primaryType(Pro=무료, SKU 안 올림) 추가 = 백화점/영화관 등 비식당 잡음 필터용 (= post-process)
  const baseMask = STANDARD_TS_FIELD_MASK + ',places.primaryType';
  const fieldMask = (!isNearby && maxPages > 1) ? baseMask + ',nextPageToken' : baseMask;
  const zonesOut: any[] = [];
  for (const d of dests) {
    const t0 = Date.now();
    const rawPlaces: any[] = [];
    let pageToken: string | null = null;
    let page = 0;
    do {
      if (pageToken) await new Promise((rs) => setTimeout(rs, 2000)); // = nextPageToken 활성 대기 (= 재호출 낭비 방지)
      const body: any = isNearby ? {
        // ⚠️ searchNearby = 구글 인기순(POPULARITY) = 검색어 없음 + locationRestriction + 최대 20 (= 사용자 SSOT 2026-06-02)
        includedTypes,  // = --included-types (기본 restaurant / 카테고리 모드 = 매핑 타입)
        maxResultCount: Math.min(per, 20),
        rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: Math.min(50000, radiusOverride ?? d.radius) } },
        languageCode: lang, regionCode: city?.country_code || 'FR',
      } : {
        // ⚠️ searchText = 객관적 발굴 = 중립 "restaurant" (= 관련성 정렬 / 한국인 큐레이션은 13 Gemini)
        //   = price-levels 주면 가격필터 (= Premium = searchNearby엔 없는 기능 = searchText 전용)
        textQuery: catMode ? effQuery : `${d.name} restaurant`,
        ...(catMode ? {} : { includedType: 'restaurant' }),  // = 카테고리/쿼리 모드 = 타입 강제 X = Google 자율 해석
        // ⚠️ 2026-06-03 = 카테고리/쿼리 = locationRestriction(강제 사각형, 범위 밖 안 줌) / 식당 = locationBias(원, 선호)
        ...(catMode
          ? { locationRestriction: { rectangle: rectFromCenter(d.lat, d.lng, (radiusOverride ?? d.radius) / 1000) } }
          : { locationBias: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: Math.min(50000, radiusOverride ?? d.radius) } } }),
        pageSize: per, languageCode: lang, regionCode: city?.country_code || 'FR',
        ...(priceLevels ? { priceLevels } : {}),
      };
      if (!isNearby && pageToken) body.pageToken = pageToken;
      const r = await fetch(`https://places.googleapis.com/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': fieldMask },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
      const j = await r.json() as any;
      if (r.status !== 200) { console.log(`  ✗ ${d.name} p${page + 1} = ${r.status} ${j.error?.message || ''}`); break; }
      rawPlaces.push(...(j.places || []));
      pageToken = isNearby ? null : (j.nextPageToken || null); // = nearby = 페이지네이션 없음
      page++;
    } while (!isNearby && pageToken && page < maxPages);

    // = place_id 중복 제거 (= 페이지 경계 안전) → RC 내림차순 (= 우리 내부 랭킹)
    const seen = new Set<string>();
    const places = rawPlaces
      .filter((p: any) => { if (!p.id || seen.has(p.id)) return false; seen.add(p.id); return true; })
      .map((p: any) => ({
        place_id: p.id, name: p.displayName?.text, name_local: p.displayName?.text, address: p.formattedAddress,
        lat: p.location?.latitude, lng: p.location?.longitude,
        review_count: p.userRatingCount ?? null,
        price_eur: p.priceRange?.endPrice?.units ? parseFloat(p.priceRange.endPrice.units) : null,
        price_start: p.priceRange?.startPrice?.units ? parseFloat(p.priceRange.startPrice.units) : null,
        photo_name: p.photos?.[0]?.name || null, photo_count: p.photos?.length || 0,
        google_maps_uri: p.googleMapsUri, business_status: p.businessStatus,
        primary_type: p.primaryType || null,
      }))
      .sort((a: any, b: any) => (b.review_count || 0) - (a.review_count || 0));
    const dt = Date.now() - t0;
    const spread: Record<string, number> = {};
    for (const p of places) spread[priceTier(p.price_eur)] = (spread[priceTier(p.price_eur)] || 0) + 1;
    const closed = places.filter((p: any) => p.business_status && p.business_status !== 'OPERATIONAL').length;
    zonesOut.push({ name: d.name, center: { lat: d.lat, lng: d.lng }, radius: d.radius, count: places.length, places });
    console.log(`✓ ${d.name} (${dt}ms, ${page}p) ${places.length}곳 | 가격대 ${JSON.stringify(spread)} | 비영업 ${closed}`);
    console.log(`   top3: ${places.slice(0, 3).map((p: any) => `${p.name}(${p.review_count})`).join(' · ')}`);
  }

  const outPath = path.join(outDir, `12-ts-discover-${zone}${label ? '-' + label : ''}-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { city_id: cityId, zone, per, pages: maxPages, method, category, text_query: catMode ? effQuery : null, lang, ...(isNearby ? { included_types: includedTypes } : {}), radius_override: radiusOverride, field_mask: STANDARD_TS_FIELD_MASK, called_date: today, dest_count: dests.length },
    zones: zonesOut,
  }, null, 2));
  const total = zonesOut.reduce((a, z) => a + z.count, 0);
  console.log(`\n═══ 합계 = ${zonesOut.length} 명소 / ${total} 곳 → ${path.basename(outPath)} ═══`);
  console.log(`다음 = post-process.ts (= OPERATIONAL 필터 + PhotoMedia + upsertPlace 5단계 + 07-merge-dups)`);
})();

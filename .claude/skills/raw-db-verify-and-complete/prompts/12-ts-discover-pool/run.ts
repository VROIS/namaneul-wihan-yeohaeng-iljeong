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
if (!cityId) { console.error('Usage: --city-id=<N> [--zone=outskirt|downtown] [--per=20]'); process.exit(1); }

const priceTier = (p: number | null) =>
  p == null ? 'unknown' : p <= 24 ? 'eco' : p <= 60 ? 'reason' : p <= 180 ? 'premium' : 'luxury';

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

  console.log(`═══ ts-discover-pool (city=${cityId} ${city?.name_en}, zone=${zone}, ${dests.length} 명소) ═══`);
  console.log(`마스크 = Enterprise (validateFieldMask 통과) / 예상 = ${dests.length} 콜 × €0.0299 = €${(dests.length * 0.0299).toFixed(2)} (= 무료 1K/월)\n`);

  const zonesOut: any[] = [];
  for (const d of dests) {
    const body = {
      textQuery: `${d.name} 맛집`,
      includedType: 'restaurant',
      locationBias: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: d.radius } },
      pageSize: per, languageCode: 'ko', regionCode: city?.country_code || 'FR',
    };
    const t0 = Date.now();
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': STANDARD_TS_FIELD_MASK },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    const j = await r.json() as any;
    if (r.status !== 200) { console.log(`  ✗ ${d.name} = ${r.status} ${j.error?.message || ''}`); continue; }
    const places = (j.places || []).map((p: any) => ({
      place_id: p.id, name: p.displayName?.text, address: p.formattedAddress,
      lat: p.location?.latitude, lng: p.location?.longitude,
      review_count: p.userRatingCount ?? null,
      price_eur: p.priceRange?.endPrice?.units ? parseFloat(p.priceRange.endPrice.units) : null,
      price_start: p.priceRange?.startPrice?.units ? parseFloat(p.priceRange.startPrice.units) : null,
      photo_name: p.photos?.[0]?.name || null, photo_count: p.photos?.length || 0,
      google_maps_uri: p.googleMapsUri, business_status: p.businessStatus,
    })).sort((a: any, b: any) => (b.review_count || 0) - (a.review_count || 0));
    const dt = Date.now() - t0;
    const spread: Record<string, number> = {};
    for (const p of places) spread[priceTier(p.price_eur)] = (spread[priceTier(p.price_eur)] || 0) + 1;
    const closed = places.filter((p: any) => p.business_status && p.business_status !== 'OPERATIONAL').length;
    zonesOut.push({ name: d.name, center: { lat: d.lat, lng: d.lng }, radius: d.radius, count: places.length, places });
    console.log(`✓ ${d.name} (${dt}ms) ${places.length}곳 | 가격대 ${JSON.stringify(spread)} | 비영업 ${closed}`);
    console.log(`   top3: ${places.slice(0, 3).map((p: any) => `${p.name}(${p.review_count})`).join(' · ')}`);
  }

  const outPath = path.join(outDir, `12-ts-discover-${zone}-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { city_id: cityId, zone, per, field_mask: STANDARD_TS_FIELD_MASK, called_date: today, dest_count: dests.length },
    zones: zonesOut,
  }, null, 2));
  const total = zonesOut.reduce((a, z) => a + z.count, 0);
  console.log(`\n═══ 합계 = ${zonesOut.length} 명소 / ${total} 곳 → ${path.basename(outPath)} ═══`);
  console.log(`다음 = post-process.ts (= OPERATIONAL 필터 + PhotoMedia + upsertPlace 5단계 + 07-merge-dups)`);
})();

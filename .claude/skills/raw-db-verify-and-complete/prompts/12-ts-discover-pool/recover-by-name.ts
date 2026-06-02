// ⚠️ 수정금지(승인필요) 2026-06-02 = 발굴이 놓친 진짜 명소를 이름으로 직접 TS 보강 → upsertPlace
// = manual-additions.ts 의 이름 → TS searchText(이름, ko, regionCode) → top1 → upsertPlace(priceOverwrite + tag 'ts-pool-{date}')
// = 가격 = endPrice 상한 / CLOSED_PERMANENTLY = skip / dayZone='outskirt' (= 명소 외곽)
// 호출:
//   npx tsx .../12-ts-discover-pool/recover-by-name.ts --city-id=19 [--apply]
//   (--apply 없으면 = dry-run = TS 결과만, 쓰기 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { MANUAL_ADD } from './manual-additions';

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
const apply = argv['apply'] === 'true';
const today = new Date().toISOString().slice(0, 10);
if (!cityId) { console.error('Usage: --city-id=<N> [--apply]'); process.exit(1); }

const hkm = (a: any, b: any) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

(async () => {
  const { STANDARD_TS_FIELD_MASK, validateFieldMask } =
    await import(pathToFileURL(path.join(ROOT, 'server/services/shared/google-places-sku.ts')).href);
  const MASK = STANDARD_TS_FIELD_MASK + ',places.businessStatus';
  validateFieldMask(MASK);

  const names = MANUAL_ADD[cityId] || [];
  if (!names.length) { console.error(`city ${cityId} MANUAL_ADD 없음`); process.exit(1); }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country_code, latitude, longitude FROM cities WHERE id=$1', [cityId])).rows[0];
  const cityCenter = { lat: parseFloat(city?.latitude) || 0, lng: parseFloat(city?.longitude) || 0 };
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name IN ('GOOGLE_MAPS_API_KEY','GOOGLE_PLACES_API_KEY') AND is_active=true ORDER BY key_name LIMIT 1`)).rows[0];
  const KEY = keyRow?.key_value || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!KEY) { console.error('Google key 미존재'); process.exit(1); }

  console.log(`═══ recover-by-name (city=${cityId} ${city?.name_en}, ${names.length}곳) = €${(names.length * 0.0299).toFixed(2)} ═══`);
  const jobs: any[] = [];
  for (const name of names) {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': MASK },
      body: JSON.stringify({ textQuery: name, includedType: 'restaurant', languageCode: 'ko', regionCode: city?.country_code || 'FR', pageSize: 1 }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json() as any;
    const p = (j.places || [])[0];
    if (!p) { console.log(`  ✗ "${name}" = 결과 없음`); continue; }
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') { console.log(`  🚫 "${name}" = ${p.businessStatus} = skip`); continue; }
    const price = p.priceRange?.endPrice?.units ? parseFloat(p.priceRange.endPrice.units) : null;
    const dist = p.location ? Math.round(hkm(cityCenter, { lat: p.location.latitude, lng: p.location.longitude }) * 10) / 10 : null;
    console.log(`  ✓ "${name}" → ${p.displayName?.text} | 리뷰 ${p.userRatingCount} | €${price ?? '?'} | ${dist}km | ${p.businessStatus}`);
    jobs.push({
      cityId, seedCategory: 'restaurant',
      nameEn: p.displayName?.text, nameLocal: p.displayName?.text,
      address: p.formattedAddress, latitude: p.location?.latitude, longitude: p.location?.longitude,
      googlePlaceId: p.id, googleMapsUri: p.googleMapsUri || null,
      googleReviewCount: p.userRatingCount ?? null,
      priceEur: price, priceOverwrite: true,
      dayZone: 'outskirt', distanceKmFromCenter: dist,
      categoryTags: ['restaurant'], phaseTags: [`ts-pool-${today}`],
    });
  }
  await c.end();

  if (!apply) { console.log(`\n=== DRY-RUN (쓰기 0) === 실행: --apply`); return; }

  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  let ins = 0, upd = 0, skip = 0;
  for (const job of jobs) {
    const rr = await upsertPlace(job);
    if (rr.action === 'inserted') ins++; else if (rr.action === 'updated') upd++; else skip++;
    console.log(`  → ${job.nameEn} = ${rr.action} (id=${rr.rowId}, ${rr.matchedBy})`);
  }
  console.log(`\n✓ ins=${ins} / upd=${upd} / skip=${skip}`);
})();

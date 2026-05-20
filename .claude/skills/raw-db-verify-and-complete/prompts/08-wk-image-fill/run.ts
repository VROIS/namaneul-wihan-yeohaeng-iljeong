// ⚠️ 수정금지(승인필요) 2026-05-20 = 08-wk-image-fill dry-run
// = 대상 행 = Wikidata SPARQL 좌표 10m → P18 이미지 + score 계산 → TRUST/VERIFY/reject 분류
//
// 호출:
//   npx tsx .../08-wk-image-fill/run.ts --city-id=19
//
// 산출물 = docs/raw/{city_id}/08-wk-image-fill-candidates-{YYYY-MM-DD}.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const UA = 'TRIPIS/1.0 (contact@vibetrip.app) Expo/54';
const RADIUS_KM = 0.01;  // = 10m (= 사용자 SSOT)

const CAT_KEYWORDS: Record<string, string[]> = {
  attraction: ['museum', 'park', 'zoo', 'aquarium', 'theme', 'tower', 'monument', 'observatory', 'church', 'palace'],
  healing: ['park', 'garden', 'jardin', 'botanic', 'spa', 'forest'],
  hotspot: ['square', 'place', 'viewpoint', 'plaza', 'street', 'avenue'],
  heritage: ['museum', 'cathedral', 'basilica', 'church', 'palace', 'castle', 'monument', 'memorial', 'historic', 'tomb', 'fortress'],
  shopping: ['market', 'department store', 'shopping center', 'mall', 'boutique', 'shop'],
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normName(s: string | null): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function nameMatch(a: string | null, b: string): number {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 2;
  if (na.includes(nb) || nb.includes(na)) return 1;
  return 0;
}

function categoryMatch(cat: string, desc: string, instance: string): boolean {
  const kw = CAT_KEYWORDS[cat] || [];
  const combined = (desc + ' ' + instance).toLowerCase();
  return kw.some(k => combined.includes(k));
}

async function wikidataAround(lat: number, lng: number): Promise<any[]> {
  const sparql = `SELECT ?place ?placeLabel ?placeDescription ?image ?coord ?instanceLabel WHERE {
  SERVICE wikibase:around {
    ?place wdt:P625 ?coord.
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^<http://www.opengis.net/ont/geosparql#wktLiteral>.
    bd:serviceParam wikibase:radius "${RADIUS_KM}".
  }
  OPTIONAL { ?place wdt:P18 ?image }
  OPTIONAL { ?place wdt:P31 ?instance. ?instance rdfs:label ?instanceLabel. FILTER(LANG(?instanceLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,ko". }
} LIMIT 15`;
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/sparql-results+json' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return [];
    const j = await r.json() as any;
    return (j.results?.bindings || []).map((b: any) => ({
      qid: b.place.value.split('/').pop(),
      label: b.placeLabel?.value || '',
      desc: b.placeDescription?.value || '',
      image: b.image?.value || null,
      coord: b.coord?.value || null,
      instance: b.instanceLabel?.value || '',
    }));
  } catch (e) {
    return [];
  }
}

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];

  // 대상 = image NULL + 식당/어드벤처 제외 + rank 21+/NULL
  const rows = (await c.query(`
    SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude
    FROM place_seed_raw
    WHERE city_id = $1
      AND seed_category NOT IN ('restaurant', 'adventure')
      AND (rank > 20 OR rank IS NULL)
      AND (image_url IS NULL OR image_url = '')
      AND NOT (phase_tags && ARRAY['archived-merge-2026-05-18','archived-merge-2026-05-15','archived-merge-2026-05-20','user-delete'])
    ORDER BY seed_category, rank NULLS LAST
  `, [cityId])).rows;
  await c.end();

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 08-wk-image-fill dry-run ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}), 대상 = ${rows.length} 행`);

  const results: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.latitude || !row.longitude) {
      results.push({ id: row.id, name: row.name_en, category: row.seed_category, status: 'no_coord' });
      continue;
    }
    const lat = Number(row.latitude), lng = Number(row.longitude);
    const wd = await wikidataAround(lat, lng);
    if (!wd || wd.length === 0) {
      results.push({ id: row.id, name: row.name_en, category: row.seed_category, status: 'no_candidate' });
      continue;
    }

    let best: any = null;
    for (const cand of wd) {
      const m = cand.coord?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      if (!m) continue;
      const cLng = Number(m[1]), cLat = Number(m[2]);
      const dist = haversineM(lat, lng, cLat, cLng);
      let score = 0;
      if (dist <= 10) score += 3; else if (dist <= 50) score += 2; else if (dist <= 100) score += 1;
      const nameSc = Math.max(
        nameMatch(row.name_en, cand.label),
        nameMatch(row.name_local, cand.label),
      );
      score += nameSc * 2;
      if (categoryMatch(row.seed_category, cand.desc, cand.instance)) score += 1;
      if (cand.image) score += 1;
      if (!best || score > best.score) best = { ...cand, dist, score, nameMatch: nameSc };
    }

    const status = best ? (best.score >= 5 ? 'trust' : best.score >= 3 ? 'verify' : 'reject') : 'no_match';
    results.push({
      id: row.id, rank: row.rank, name: row.name_en, name_local: row.name_local,
      category: row.seed_category, addr: row.address,
      coord: `${row.latitude},${row.longitude}`,
      status,
      best: best ? {
        qid: best.qid, label: best.label, desc: best.desc, instance: best.instance,
        image: best.image, dist: Math.round(best.dist), score: best.score, nameMatch: best.nameMatch,
      } : null,
    });
    if (i % 10 === 0) console.log(`  ${i + 1}/${rows.length} 처리 중...`);
  }

  const outPath = path.join(outDir, `08-wk-image-fill-candidates-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    meta: { city_id: cityId, called_at: new Date().toISOString(), input_rows: rows.length, radius_km: RADIUS_KM },
    results,
  }, null, 2));

  const stats: Record<string, number> = {};
  for (const r of results) stats[r.status] = (stats[r.status] || 0) + 1;
  console.log(`\n═══ 결과 ═══`);
  console.log(JSON.stringify(stats, null, 2));
  console.log(`✓ 저장 = ${outPath}`);
  console.log(`\n⚠️ 사용자 cc2 검수 필수:`);
  console.log(`  npx tsx .../08-wk-image-fill/post-process.ts --city-id=${cityId} --date=${today} --apply-status=trust [--apply-ids=N,N,...]`);
})();
// 백그라운드 13 도시 발굴 자동화
// Stanford → Las Vegas → Busan → Madrid → Brussels → London → Munich → Paris
// → East Rutherford → Foxborough → Baltimore → Arlington → Toronto
// 각 도시: textSearch 7 → top 10 × 7 (multi-tag) → INSERT → PhotoMedia + Storage → UPDATE

import fs from 'fs';
import pg from 'pg';

const GOOGLE_KEY = 'AIzaSyBRfDSQVziEASpsVXKdh6rqmxRvVYc-TO4';
const SUPABASE_URL = 'https://wxebceflvuythuodemro.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZWJjZWZsdnV5dGh1b2RlbXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzMwOTIsImV4cCI6MjA4MzgwOTA5Mn0.EtF8kK5h0PGAd5_mRGloXCinAA0yg-7ye00-gPRvLw0';

const SUPA_URL = process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

const CITIES = [
  { id: 103, name: 'Stanford', country: 'United States' },
  { id: 104, name: 'Las Vegas', country: 'United States' },
  { id: 105, name: 'Busan', country: 'South Korea' },
  { id: 37,  name: 'Madrid', country: 'Spain' },
  { id: 41,  name: 'Brussels', country: 'Belgium' },
  { id: 24,  name: 'London', country: 'United Kingdom' },
  { id: 39,  name: 'Munich', country: 'Germany' },
  { id: 19,  name: 'Paris', country: 'France' },
  { id: 106, name: 'East Rutherford', country: 'United States' },
  { id: 107, name: 'Foxborough', country: 'United States' },
  { id: 108, name: 'Baltimore', country: 'United States' },
  { id: 109, name: 'Arlington', country: 'United States' },
  { id: 110, name: 'Toronto', country: 'Canada' },
];

const QUERIES = {
  heritage:   'historic sites',
  hotspot:    'viewpoints photo spots',
  attraction: 'tourist attractions',
  adventure:  'outdoor activities adventure',
  healing:    'parks gardens spa',
  shopping:   'shopping malls',
  restaurant: 'restaurants',
};
const PRIORITY = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant'];

function sql_esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return v;
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sql_arr(a) {
  if (!a || a.length === 0) return 'NULL';
  return 'ARRAY[' + a.map(x => sql_esc(x)).join(',') + ']::text[]';
}
function sql_jsonb(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}

async function processCity(city, db) {
  const startTime = Date.now();
  console.log('\n' + '═'.repeat(70));
  console.log(`🌆 ${city.name} (id=${city.id}, ${city.country})`);
  console.log('═'.repeat(70));

  // ── Stage 1: textSearch 7 categories (parallel)
  console.log('Stage 1: textSearch (7 categories, FieldMask=*)');
  const cats = await Promise.all(PRIORITY.map(async cat => {
    const textQuery = `${QUERIES[cat]} in ${city.name}, ${city.country}`;
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': '*',
      },
      body: JSON.stringify({ textQuery, pageSize: 20 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) throw new Error(`textSearch ${cat} ${resp.status}`);
    const data = await resp.json();
    return { cat, places: data.places || [] };
  }));

  // Stage 2: top 10 per category (multi-tag)
  const placeMap = new Map();
  for (const { cat, places } of cats) {
    const sorted = [...places].sort((a,b) => (b.userRatingCount||0) - (a.userRatingCount||0)).slice(0, 10);
    sorted.forEach((p, idx) => {
      if (!placeMap.has(p.id)) {
        placeMap.set(p.id, { p, primary: cat, primaryRank: idx+1, cats: new Set() });
      }
      placeMap.get(p.id).cats.add(cat);
    });
  }
  const rows = [...placeMap.values()];
  console.log(`  → ${rows.length} unique places (multi-tag)`);

  // Stage 3: INSERT (batches of 10)
  console.log('Stage 3: DELETE + INSERT');
  await db.query(`
    DELETE FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
      AND seed_category IN ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping')
  `, [city.id]);

  const valuesArr = rows.map(({ p, primary, primaryRank, cats }) => {
    const photoName = p.photos?.[0]?.name || null;
    const reviewSummary = p.reviewSummary?.text?.text || null;
    const editorial = p.generativeSummary?.overview?.text || p.editorialSummary?.text?.text || p.editorialSummary?.text || null;
    const hours = p.regularOpeningHours?.weekdayDescriptions || null;
    return '(' + city.id + ', ' + sql_esc(primary) + ", 'bts2026', " + primaryRank + ', '
      + sql_esc(p.displayName?.text || '') + ', '
      + sql_esc(p.location?.latitude) + ', ' + sql_esc(p.location?.longitude) + ', '
      + sql_esc(p.id) + ', ' + sql_esc(p.userRatingCount || 0) + ', '
      + sql_esc(p.rating || null) + ', '
      + sql_esc(editorial) + ', '
      + sql_esc(reviewSummary) + ', '
      + sql_jsonb(hours) + ', '
      + sql_jsonb(photoName ? [{name: photoName}] : null) + ', '
      + sql_esc(p.googleMapsUri || null) + ', '
      + sql_arr([...cats]) + ', '
      + sql_arr(['bts2026']) + ', NOW())';
  });

  // Insert in chunks of 10
  const chunkSize = 10;
  for (let i = 0; i < valuesArr.length; i += chunkSize) {
    const chunk = valuesArr.slice(i, i+chunkSize);
    const sql = `INSERT INTO place_seed_raw (city_id, seed_category, collection_phase, rank, name_en, latitude, longitude, google_place_id, google_review_count, google_rating, editorial_summary, nubi_reason, opening_hours, photo_urls, evidence_url, category_tags, phase_tags, created_at) VALUES ${chunk.join(',')};`;
    await db.query(sql);
  }
  console.log(`  → ${rows.length} INSERT 완료`);

  // Stage 4: PhotoMedia + Storage upload (600ms 간격, 분당 100 안전)
  console.log('Stage 4: PhotoMedia + Storage');
  const dbRows = await db.query(`
    SELECT id, seed_category, google_place_id, photo_urls
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase = 'bts2026'
      AND seed_category IN ('attraction','restaurant','healing','adventure','hotspot','heritage','shopping')
    ORDER BY id
  `, [city.id]);

  const updateValues = [];
  let success = 0, fail = 0;
  for (const row of dbRows.rows) {
    const photoName = row.photo_urls?.[0]?.name;
    if (!photoName) { fail++; continue; }
    const fileName = `${city.id}/${row.seed_category}/${row.id}.jpg`;
    try {
      const r1 = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${GOOGLE_KEY}`, { signal: AbortSignal.timeout(20000) });
      if (!r1.ok) throw new Error(`PM ${r1.status}`);
      const buffer = Buffer.from(await r1.arrayBuffer());
      const r2 = await fetch(`${SUPABASE_URL}/storage/v1/object/place-images/${fileName}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: buffer, signal: AbortSignal.timeout(20000),
      });
      if (!r2.ok) throw new Error(`Storage ${r2.status}`);
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/place-images/${fileName}`;
      updateValues.push(`(${row.id}, '${storageUrl}', 'Photo via Google Places (${row.google_place_id})')`);
      success++;
    } catch (e) {
      fail++;
    }
    await new Promise(r => setTimeout(r, 600)); // 100/min safe
  }

  // Stage 5: UPDATE image_url
  if (updateValues.length > 0) {
    await db.query(`
      UPDATE place_seed_raw AS p SET image_url = v.url, image_attribution = v.attr, image_updated_at = NOW()
      FROM (VALUES ${updateValues.join(',')}) AS v(id, url, attr)
      WHERE p.id = v.id
    `);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ ${city.name}: ${success}/${dbRows.rows.length} 성공, ${elapsed}s`);
  return { city: city.name, success, total: dbRows.rows.length, elapsed };
}

// Main
const db = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const results = [];
for (const city of CITIES) {
  try {
    const r = await processCity(city, db);
    results.push(r);
    fs.writeFileSync('_13cities_progress.json', JSON.stringify(results, null, 2));
  } catch (e) {
    console.error(`❌ ${city.name}: ${e.message}`);
    results.push({ city: city.name, error: e.message });
    fs.writeFileSync('_13cities_progress.json', JSON.stringify(results, null, 2));
  }
  // 도시 간 30초 휴식 (분당 한도 회복)
  await new Promise(r => setTimeout(r, 30000));
}

console.log('\n' + '═'.repeat(70));
console.log('🎯 최종 결과');
console.log('═'.repeat(70));
results.forEach(r => {
  if (r.error) console.log(`❌ ${r.city}: ${r.error}`);
  else console.log(`✅ ${r.city}: ${r.success}/${r.total} (${r.elapsed}s)`);
});

await db.end();

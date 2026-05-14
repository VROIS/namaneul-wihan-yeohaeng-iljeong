// QA 검수용 Express-style 서버 (node http)
// 사용자 SSOT: 백엔드 API + fetch = 진짜 동적 DB
//   GET /api/cities → 9 도시 list
//   GET /api/places?city_id=N → 도시의 모든 phase row
//   GET /api/search?q=X → 모든 도시 통합 검색
//   GET /qa/* → 정적 서빙 (docs/qa/)

import fs from 'fs';
import http from 'http';
import path from 'path';
import pg from 'pg';

const env = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const PORT = 3001;
const NINE = ['Paris', 'Madrid', 'Brussels', 'London', 'Munich', 'Mexico City', 'Stanford', 'Las Vegas', 'Busan'];
const SEVEN_CATS = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping', 'restaurant'];

const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const GOOGLE_KEY = (await c.query(
  `SELECT key_value FROM api_keys WHERE key_name='GOOGLE_MAPS_API_KEY' AND is_active=true`
)).rows[0].key_value;

console.log('DB connected. Google key: ' + (GOOGLE_KEY ? 'OK' : 'MISSING'));

// baseline / changed JSON 정적 서빙 (= /baseline/* /changed/* → docs/baseline-*/ docs/changed-*/)
async function serveSnapshot(res, urlPath, prefix) {
  const dirs = fs.readdirSync('docs').filter(d => d.startsWith(prefix + '-')).sort().reverse();
  const fileName = urlPath.replace(`/${prefix}/`, '');
  for (const d of dirs) {
    const fp = `docs/${d}/${fileName}`;
    if (fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(fp));
      return true;
    }
  }
  return false;
}
async function serveBaseline(res, urlPath) { return serveSnapshot(res, urlPath, 'baseline'); }

async function apiCities(res) {
  const r = await c.query(`
    SELECT c.id, c.name_en, c.country, c.country_code,
      c.latitude::float AS lat, c.longitude::float AS lng,
      c.bts_concert_dates::text AS bts_dates
    FROM cities c
    WHERE c.name_en = ANY($1)
    ORDER BY c.bts_concert_dates::text ASC NULLS LAST, c.name_en
  `, [NINE]);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(r.rows));
}

async function apiPlaces(res, params) {
  const cityId = parseInt(params.city_id, 10);
  if (!cityId) { res.writeHead(400); res.end('city_id required'); return; }
  const places = (await c.query(`
    SELECT id, seed_category AS cat, rank, gemini_rank, collection_phase AS phase,
      name_en, name_ko, name_local,
      latitude::float AS lat, longitude::float AS lng,
      address, google_review_count, image_url,
      editorial_summary AS summary_en, summary_ko, nubi_reason,
      day_zone, distance_km_from_center
    FROM place_seed_raw
    WHERE city_id = $1 AND collection_phase IN ('gemini3-2026-05','bts2026')
      AND seed_category = ANY($2)
      AND latitude IS NOT NULL
    ORDER BY seed_category, rank
  `, [cityId, SEVEN_CATS])).rows;

  // BTS venue 메타 (= 지도 마커용)
  const venue = (await c.query(`
    SELECT name_en, name_ko, latitude::float AS lat, longitude::float AS lng, image_url, address
    FROM place_seed_raw WHERE city_id=$1 AND seed_category='bts_venue' LIMIT 1
  `, [cityId])).rows[0] || null;

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ places, venue }));
}

async function apiSearch(res, params) {
  const q = (params.q || '').trim();
  if (q.length < 2) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('[]');
    return;
  }
  const pat = '%' + q.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
  const r = await c.query(`
    SELECT p.id, p.seed_category AS cat, p.rank, p.collection_phase AS phase,
      c.name_en AS city, c.id AS city_id,
      p.name_en, p.name_ko, p.name_local,
      p.latitude::float AS lat, p.longitude::float AS lng,
      p.address, p.google_review_count, p.image_url,
      p.editorial_summary AS summary_en, p.summary_ko, p.nubi_reason,
      p.day_zone, p.distance_km_from_center
    FROM place_seed_raw p JOIN cities c ON c.id = p.city_id
    WHERE c.name_en = ANY($1) AND p.collection_phase IN ('gemini3-2026-05','bts2026')
      AND p.seed_category = ANY($2)
      AND p.latitude IS NOT NULL
      AND (
        p.name_en ILIKE $3 OR p.name_ko ILIKE $3 OR p.name_local ILIKE $3 OR p.address ILIKE $3
      )
    ORDER BY p.rank NULLS LAST
    LIMIT 200
  `, [NINE, SEVEN_CATS, pat]);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(r.rows));
}

function serveStatic(res, pathname) {
  let p = pathname;
  if (p === '/' || p === '' || p === '/qa' || p === '/qa/') p = '/docs/qa/index.html';
  else if (p.startsWith('/qa/')) p = '/docs' + p;
  const filePath = path.join(process.cwd(), p.replace(/^\//, ''));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not found: ' + p); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const ct = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const params = Object.fromEntries(u.searchParams);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (u.pathname === '/api/cities') await apiCities(res);
    else if (u.pathname === '/api/places') await apiPlaces(res, params);
    else if (u.pathname === '/api/search') await apiSearch(res, params);
    else if (u.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ google_key: GOOGLE_KEY }));
    }
    else if (u.pathname.startsWith('/baseline/')) {
      const ok = await serveBaseline(res, u.pathname);
      if (!ok) { res.writeHead(404); res.end('Baseline not found'); }
    }
    else if (u.pathname.startsWith('/changed/')) {
      const ok = await serveSnapshot(res, u.pathname, 'changed');
      if (!ok) { res.writeHead(404); res.end('Changed not found'); }
    }
    else if (u.pathname.startsWith('/ssot/')) {
      const ok = await serveSnapshot(res, u.pathname, 'ssot');
      if (!ok) { res.writeHead(404); res.end('SSOT not found'); }
    }
    else if (u.pathname.startsWith('/db-only/')) {
      const ok = await serveSnapshot(res, u.pathname, 'db-only');
      if (!ok) { res.writeHead(404); res.end('DB-only not found'); }
    }
    else serveStatic(res, u.pathname);
  } catch (e) {
    console.error('Request error:', e.message);
    res.writeHead(500); res.end('Error: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\nQA server ready: http://localhost:${PORT}/qa/`);
  console.log(`API endpoints:`);
  console.log(`  GET /api/cities`);
  console.log(`  GET /api/places?city_id=N`);
  console.log(`  GET /api/search?q=...`);
  console.log(`  GET /api/config (google key)`);
});

process.on('SIGTERM', () => { c.end(); server.close(); process.exit(0); });
process.on('SIGINT', () => { c.end(); server.close(); process.exit(0); });
